package com.ecog.acl;

import cn.hutool.crypto.SecureUtil;
import com.baomidou.mybatisplus.mapper.EntityWrapper;
import com.ecog.acl.api.UserController;
import com.ecog.acl.api.dto.UserLoginDTO;
import com.ecog.acl.api.param.UserLoginParam;
import com.ecog.acl.bo.UserLoginBO;
import com.ecog.acl.common.HttpResult;
import com.ecog.acl.dao.UserTokenDao;
import com.ecog.acl.entity.User;
import com.ecog.acl.entity.UserToken;
import com.ecog.acl.mvc.AuthInterceptor;
import com.ecog.acl.service.UserService;
import com.ecog.acl.service.UserTokenService;
import com.ecog.acl.service.WorkWechatService;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit4.SpringRunner;

import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.Mockito.when;

@RunWith(SpringRunner.class)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
        "eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false",
        "spring.cloud.config.discovery.enabled=false"
})
@ActiveProfiles("dev")
public class MultiDeviceLoginIntegrationTest {

    private static final String APP_ID = "app101";
    private static final long THIRTY_DAYS_MS = 2592000L * 1000L;
    // R2复核P1-2：user_token.expire_time为datetime秒级精度，写入时对毫秒舍入，断言两侧留1秒容差
    private static final long DB_DATETIME_TOLERANCE_MS = 1000L;

    @Autowired
    private UserService userService;
    @Autowired
    private UserTokenService userTokenService;
    @Autowired
    private UserController userController;
    @Autowired
    private AuthInterceptor authInterceptor;
    @Autowired
    private DataSource dataSource;
    @Autowired
    private UserTokenDao userTokenDao;

    @MockBean
    private WorkWechatService workWechatService;

    private final Set<String> testTokens = ConcurrentHashMap.newKeySet();

    @After
    public void cleanUpTestTokens() throws Exception {
        for (String token : testTokens) {
            userTokenService.deleteByToken(token);
        }
    }

    @Test
    public void accountTokensCoexistAndLogoutOnlyRevokesCurrentToken() throws Exception {
        String username = requiredEnv("ACL_ADMIN_USERNAME");
        String password = requiredEnv("ACL_ADMIN_PASSWORD");

        User query = new User();
        query.setUserName(username);
        Integer userId = userService.selectOne(new EntityWrapper<>(query)).getId();
        Set<String> baseline = activeTokenIds(userId);
        // R2复核P1-2：token过期时间在loginAccount内部签发，边界计时必须先于登录调用取得
        long beforeA = System.currentTimeMillis();
        UserLoginDTO loginA = loginAccount(username, password);
        long afterA = System.currentTimeMillis();
        String tokenA = register(loginA.getAccessToken());
        assertThirtyDays(tokenA, beforeA, afterA);
        String tokenB = register(loginAccount(username, password).getAccessToken());

        assertNotEquals(tokenA, tokenB);
        assertEquals(32, tokenA.length());
        assertEquals(32, tokenB.length());
        assertValid(tokenA, userId);
        assertValid(tokenB, userId);
        assertActiveTokens(userId, baseline, tokenA, tokenB);
        assertEquals(HttpStatus.OK, userController.getUserMenuTreeList(tokenA).getCode());
        assertEquals(HttpStatus.OK, userController.getUserConfigList(tokenB).getCode());
        assertInterceptor(tokenA, true);

        assertEquals(HttpStatus.OK, userController.logout(tokenA).getCode());
        assertNull(userTokenService.getById(tokenA));
        assertValid(tokenB, userId);
        assertActiveTokens(userId, baseline, tokenB);
        assertInvalidEverywhere(tokenA);

        assertEquals(HttpStatus.OK, userController.logout(tokenA).getCode());
        assertValid(tokenB, userId);
        assertEquals(HttpStatus.OK, userController.logout(tokenB).getCode());
        assertInvalidEverywhere(tokenB);
        assertActiveTokens(userId, baseline);
    }

    @Test
    public void qywxOAuthUsesIndependentRandomTokensAndSameThirtyDays() throws Exception {
        User boundUser = findQywxBoundUser();
        Integer userId = boundUser.getId();
        Set<String> baseline = activeTokenIds(userId);
        when(workWechatService.getUserInfoByCode("TEST-OAUTH-CODE")).thenReturn(boundUser.getQywxUserId());

        long beforeA = System.currentTimeMillis();
        HttpResult<UserLoginDTO> loginAResult = userController.qywxOAuthLogin("TEST-OAUTH-CODE", APP_ID);
        long afterA = System.currentTimeMillis();
        assertEquals(HttpStatus.OK, loginAResult.getCode());
        String tokenA = register(loginAResult.getData().getAccessToken());
        assertThirtyDays(tokenA, beforeA, afterA);

        HttpResult<UserLoginDTO> loginBResult = userController.qywxOAuthLogin("TEST-OAUTH-CODE", APP_ID);
        assertEquals(HttpStatus.OK, loginBResult.getCode());
        String tokenB = register(loginBResult.getData().getAccessToken());
        assertNotEquals(tokenA, tokenB);
        assertValid(tokenA, userId);
        assertValid(tokenB, userId);
        assertActiveTokens(userId, baseline, tokenA, tokenB);

        userController.logout(tokenA);
        assertInvalidEverywhere(tokenA);
        assertValid(tokenB, userId);
        assertActiveTokens(userId, baseline, tokenB);
    }

    @Test
    public void concurrentQywxLoginsKeepTwoDistinctValidTokens() throws Exception {
        User boundUser = findQywxBoundUser();
        Integer userId = boundUser.getId();
        Set<String> baseline = activeTokenIds(userId);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            Future<String> futureA = executor.submit(() -> concurrentQywxLogin(boundUser, ready, start));
            Future<String> futureB = executor.submit(() -> concurrentQywxLogin(boundUser, ready, start));
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            String tokenA = futureA.get(60, TimeUnit.SECONDS);
            String tokenB = futureB.get(60, TimeUnit.SECONDS);
            assertNotEquals(tokenA, tokenB);
            assertValid(tokenA, userId);
            assertValid(tokenB, userId);
            assertActiveTokens(userId, baseline, tokenA, tokenB);
        } finally {
            start.countDown();
            // R3复核P1-2/R4：线程终止状态与token清理状态分离——先等待线程实际终止，
            // 再扫描登记新增token，最后才报告终止失败；任何断言都不允许提前打断兜底登记
            boolean workersTerminated = awaitWorkersTermination(executor);
            // 兜底识别：登记测试期间该用户新增的全部token（含未通过Future返回的已提交插入），基线token除外
            for (String tokenId : activeTokenIds(userId)) {
                if (!baseline.contains(tokenId)) {
                    register(tokenId);
                }
            }
            if (!workersTerminated) {
                fail("并发工作线程未在宽限期内终止：已按登记清单交给@After清理，但无法确认清理完整");
            }
        }
    }

    /**
     * R4修订：shutdownNow只代表请求中断，不代表线程已终止；中断路径必须等待实际终止后再返回。
     * 等待过程可重复响应中断但绝不放弃等待（吞掉中断继续等，最终恢复中断位）；
     * 本方法内不做任何JUnit断言，线程是否终止由返回值交给调用方在登记完成后统一处置。
     */
    private boolean awaitWorkersTermination(ExecutorService executor) {
        boolean interrupted = false;
        try {
            executor.shutdown();
            // R2复核P1-3：等待工作线程真正终止后再做清理，避免@After与仍在提交的插入竞态遗留token
            if (executor.awaitTermination(60, TimeUnit.SECONDS)) {
                return true;
            }
            executor.shutdownNow();
            if (executor.awaitTermination(30, TimeUnit.SECONDS)) {
                return true;
            }
            return false;
        } catch (InterruptedException ie) {
            interrupted = true;
            executor.shutdownNow();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(60);
            boolean terminated = false;
            while (System.nanoTime() < deadline) {
                try {
                    terminated = executor.awaitTermination(1, TimeUnit.SECONDS);
                } catch (InterruptedException ie2) {
                    interrupted = true;
                    continue;
                }
                if (terminated) {
                    break;
                }
            }
            return terminated;
        } finally {
            if (interrupted) {
                Thread.currentThread().interrupt();
            }
        }
    }

    @Test
    public void expiredTokenIsRejectedEverywhere() throws Exception {
        User boundUser = findQywxBoundUser();
        String expired = register(userService.qywxLogin(boundUser, APP_ID, -1).getAccessToken());
        assertInvalidEverywhere(expired);
        // expire_time在真实库为NOT NULL；NULL语义由UserTokenTest固定时间单元测试覆盖。
    }

    @Test
    public void persistenceFailureNeverReturnsAnUnusableToken() throws Exception {
        // R2复核P1-5：前提=dev库SELECT @@sql_mode含STRICT_TRANS_TABLES（evidence/task1-dev-sqlmode-preflight.txt），
        // 超长app_id(char(6))必然触发MySQL 1406插入失败，不存在截断落库路径
        assertTrue("dev库必须为严格模式，否则本测试前提不成立",
                querySqlMode().contains("STRICT_TRANS_TABLES"));
        User boundUser = findQywxBoundUser();
        Integer userId = boundUser.getId();
        Set<String> baseline = activeTokenIds(userId);
        String oversizedAppId = new String(new char[256]).replace('\0', 'x');
        UserLoginBO result = null;
        RuntimeException rejected = null;
        try {
            result = userService.qywxLogin(boundUser, oversizedAppId, 3600);
        } catch (RuntimeException e) {
            if (!isMysqlDataTooLong(e)) {
                // 仅MySQL 1406 Data-too-long算预期持久化拒绝；其余运行时异常不冒充数据库失败，原样上抛
                throw e;
            }
            rejected = e;
        }
        assertNull("持久化失败时不得返回可用登录token", result);
        assertNotNull("必须发生MySQL 1406持久化拒绝", rejected);
        // 清理兜底：按超长原值、char(6)截断值、该用户新增三个口径识别任何意外落库的token（先登记再断言，保证可清理）
        for (UserToken token : activeTokensByApp(oversizedAppId)) {
            register(token.getId());
        }
        for (UserToken token : activeTokensByApp(oversizedAppId.substring(0, 6))) {
            register(token.getId());
        }
        for (String tokenId : activeTokenIds(userId)) {
            if (!baseline.contains(tokenId)) {
                register(tokenId);
            }
        }
        assertTrue("不得遗留超长或截断app_id的token",
                activeTokensByApp(oversizedAppId).isEmpty()
                        && activeTokensByApp(oversizedAppId.substring(0, 6)).isEmpty());
        assertEquals("持久化失败后该用户不得新增任何token", baseline, activeTokenIds(userId));
    }

    private String querySqlMode() throws Exception {
        try (Connection connection = dataSource.getConnection()) {
            try (Statement statement = connection.createStatement()) {
                try (ResultSet rs = statement.executeQuery("SELECT @@sql_mode")) {
                    assertTrue(rs.next());
                    return rs.getString(1);
                }
            }
        }
    }

    private static boolean isMysqlDataTooLong(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            if (c instanceof SQLException && ((SQLException) c).getErrorCode() == 1406) {
                return true;
            }
        }
        return false;
    }

    private UserLoginDTO loginAccount(String username, String password) {
        UserLoginParam param = new UserLoginParam();
        param.setUserName(username);
        param.setPassWord(SecureUtil.md5(password).toLowerCase());
        param.setAppId(APP_ID);
        HttpResult<UserLoginDTO> result = userController.login(param);
        assertEquals(HttpStatus.OK, result.getCode());
        return result.getData();
    }

    private String concurrentQywxLogin(User user, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        if (!start.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent start timeout");
        }
        UserLoginBO login = userService.qywxLogin(user, APP_ID, 3600);
        assertNotNull(login);
        return register(login.getAccessToken());
    }

    private User findQywxBoundUser() {
        EntityWrapper<User> wrapper = new EntityWrapper<>();
        wrapper.isNotNull("qywx_user_id").ne("qywx_user_id", "");
        List<User> users = userService.selectList(wrapper);
        assertFalse("No dev user with bound qywx_user_id", users.isEmpty());
        return users.get(0);
    }

    private String register(String token) {
        assertNotNull(token);
        testTokens.add(token);
        return token;
    }

    private Set<String> activeTokenIds(Integer userId) {
        Set<String> result = new HashSet<>();
        for (UserToken token : activeTokensByApp(APP_ID)) {
            if (userId.equals(token.getUserId())) {
                result.add(token.getId());
            }
        }
        return result;
    }

    private List<UserToken> activeTokensByApp(String appId) {
        EntityWrapper<UserToken> wrapper = new EntityWrapper<>();
        wrapper.eq("app_id", appId);
        return userTokenDao.selectList(wrapper);
    }

    private void assertActiveTokens(Integer userId, Set<String> baseline, String... newTokens) {
        Set<String> expected = new HashSet<>(baseline);
        expected.addAll(java.util.Arrays.asList(newTokens));
        assertEquals(expected, activeTokenIds(userId));
    }

    private void assertThirtyDays(String token, long start, long end) throws Exception {
        long actual = userTokenService.getById(token).getExpireTime().getTime();
        assertTrue("expireTime早于预期下界", actual >= start + THIRTY_DAYS_MS - DB_DATETIME_TOLERANCE_MS);
        assertTrue("expireTime晚于预期上界", actual <= end + THIRTY_DAYS_MS + DB_DATETIME_TOLERANCE_MS);
    }

    private void assertValid(String token, Integer expectedUserId) throws Exception {
        UserToken stored = userTokenService.getById(token);
        assertNotNull(stored);
        assertEquals(expectedUserId, stored.getUserId());
        assertEquals(APP_ID, stored.getAppId());
        assertTrue(stored.isValid(new Date()));
        assertEquals(HttpStatus.OK, userController.getUserByToken(token).getCode());
    }

    private void assertInvalidEverywhere(String token) throws Exception {
        assertEquals(HttpStatus.NOT_FOUND, userController.getUserByToken(token).getCode());
        assertEquals(HttpStatus.NOT_FOUND, userController.getUserMenuTreeList(token).getCode());
        assertEquals(HttpStatus.NOT_FOUND, userController.getUserConfigList(token).getCode());
        assertInterceptor(token, false);
    }

    private void assertInterceptor(String token, boolean expected) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI("/user/modifypassword");
        request.setParameter("accessToken", token);
        MockHttpServletResponse response = new MockHttpServletResponse();
        assertEquals(expected, authInterceptor.preHandle(request, response, new Object()));
        if (!expected) {
            assertTrue(response.getContentAsString().contains("UNAUTHORIZED"));
        }
    }

    private String requiredEnv(String name) {
        String value = System.getenv(name);
        assertNotNull("Missing environment variable " + name, value);
        return value;
    }
}
