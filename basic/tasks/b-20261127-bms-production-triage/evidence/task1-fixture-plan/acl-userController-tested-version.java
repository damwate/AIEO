package com.ecog.acl.api;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONObject;
import com.baomidou.mybatisplus.mapper.EntityWrapper;
import com.baomidou.mybatisplus.plugins.Page;
import com.ecog.acl.api.dto.*;
import com.ecog.acl.api.param.UserLoginParam;
import com.ecog.acl.api.param.UserParam;
import com.ecog.acl.application.config.ServerConfig;
import com.ecog.acl.bo.MenuTreeBO;
import com.ecog.acl.bo.UserBO;
import com.ecog.acl.bo.UserLoginBO;
import com.ecog.acl.common.HttpResult;
import com.ecog.acl.common.PageResult;
import com.ecog.acl.common.dto.WechatExternalPayBillDTO;
import com.ecog.acl.entity.DynamicConfig;
import com.ecog.acl.entity.User;
import com.ecog.acl.entity.UserToken;
import com.ecog.acl.service.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * @Author xiashenbin
 * @Date 2018/12/11 3:16 PM
 */
@RestController
@RequestMapping("/user")
public class UserController {
    private static final Logger logger = LoggerFactory.getLogger(UserController.class);
    //新登录会话统一30天；历史token仍按各自已存expireTime自然失效
    private static final long LOGIN_EXPIRE_TIME_SPAN_SECONDS = 2592000L;

    @Autowired
    private UserService userService;

    @Autowired
    private RelationService relationService;

    @Autowired
    private MenuService menuService;

    @Autowired
    private DynamicConfigService configService;

    @Autowired
    private UserTokenService userTokenService;

    @Autowired
    private ServerConfig config;

    @Autowired
    private WorkWechatService wechatService;

    /**
     * 添加用户
     *
     * @param param
     * @return
     */
    @PostMapping("/add")
    public HttpResult<Boolean> addUser(@RequestBody UserParam.Add param) {
        if (param == null || StrUtil.isBlank(param.getUserName())) {
            return HttpResult.parameterError("姓名不能为空");
        }

        try {
            String userKey = String.valueOf(System.currentTimeMillis());
            User user = new User();
            if (StrUtil.isNotEmpty(param.getPassword())) {
                user.setPassWord(param.getPassword());
            } else {
                user.setPassWord(config.getUser().getDefaultPassword());
            }
            user.setUserName(param.getUserName());
            user.setUserKey(userKey);
            user.setPhone(param.getPhone());
            user.setMailAddress(param.getMailAddress());
            user.setRealName(param.getRealName());
            user.setOrgId(param.getOrgId());
            return HttpResult.success(userService.addUser(user, param.getMasterOrgIds()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(e.getMessage());
        } catch (Exception e) {
            logger.error("新增用户失败", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 修改用户
     *
     * @param param
     * @return
     */
    @PostMapping("/modify")
    public HttpResult<Boolean> modifyUser(@RequestBody UserParam.Modify param) {
        if (param == null || param.getId() == null ||
                (StrUtil.isBlank(param.getUserName()))) {
            return HttpResult.parameterError("用户信息不完整");
        }

        try {
            User user = new User();
            user.setId(param.getId());
            user.setUserName(param.getUserName());
            user.setPhone(param.getPhone());
            user.setRealName(param.getRealName());
            user.setOrgId(param.getOrgId());
            user.setMailAddress(param.getMailAddress());
            if (StrUtil.isNotEmpty(param.getPassword())) {
                user.setPassWord(param.getPassword());
                user.setUserKey(String.valueOf(System.currentTimeMillis()));
            }
            return HttpResult.success(userService.modifyUser(user, param.getMasterOrgIds()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError("参数错误");
        } catch (Exception e) {
            logger.error("用户修改失败", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 用户登录检查用户密码
     *
     * @param userToken
     * @return
     */
    @PostMapping("/login")
    public HttpResult<UserLoginDTO> login(@RequestBody UserLoginParam userToken) {
        if (StrUtil.isBlank(userToken.getUserName()) || StrUtil.isBlank(userToken.getPassWord()) || StrUtil.isBlank(userToken.getAppId())) {
            return HttpResult.parameterError("用户信息不完整");
        }

        try {
            UserLoginBO loginBO = userService.userLogin(userToken.getUserName(),
                    userToken.getPassWord(), userToken.getAppId(), LOGIN_EXPIRE_TIME_SPAN_SECONDS);
            if (loginBO == null) {
                return HttpResult.authError("用户名或密码错误");
            } else {
                return HttpResult.success(UserLoginDTO.from(loginBO));
            }
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError("参数错误");
        } catch (Exception e) {
            logger.error("用户登录失败", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 修改用户密码
     *
     * @param param
     * @return
     */
    @PostMapping("/modifypassword")
    public HttpResult<Boolean> modifyUserPassword(@RequestBody UserParam.ModifyPassword param) {
        if (param == null || StrUtil.isBlank(param.getPassword()) || StrUtil.isBlank(param.getNewPassword()) ||
                StrUtil.isBlank(param.getUserName())) {
            return HttpResult.parameterError("参数不完整");
        }

        try {
            if (userService.modifyPassword(param.getUserName(), param.getPassword(), param.getNewPassword())) {
                return HttpResult.success(true);
            }
            return HttpResult.systemError("操作失败");
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(e.getMessage());
        } catch (Exception e) {
            logger.error("修改用户密码失败", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 删除用户
     *
     * @param id
     * @return
     */
    @PostMapping("/delete")
    public HttpResult<Boolean> deleteUser(@RequestParam("id") Integer id) {
        if (id == null) {
            return HttpResult.parameterError("参数错误");
        }

        try {
            return HttpResult.success(
                    userService.deleteById(id)
            );
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error(String.format("删除用户[%d]失败", id), e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 获取用户详情
     *
     * @param id
     * @return
     */
    @GetMapping("/get")
    public HttpResult<UserDetailDTO> getUserById(@RequestParam("id") Integer id) {
        if (id == null) {
            return HttpResult.parameterError();
        }
        try {
            UserBO user = userService.getUser(id);
            if (user == null) {
                return HttpResult.notFound();
            }

            return HttpResult.success(UserDetailDTO.from(user));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error(String.format("查询用户[%d]错误", id), e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 获取用户详情
     *
     * @param accessToken
     * @return
     */
    @GetMapping("/getByToken")
    public HttpResult<UserDTO> getUserByToken(@RequestParam("accessToken") String accessToken) {
        if (StrUtil.isEmpty(accessToken)) {
            return HttpResult.parameterError();
        }
        try {
            UserToken userToken = userTokenService.getById(accessToken);
            //统一规则：不存在、已吊销、NULL有效期或已到期均拒绝
            if (userToken == null || !userToken.isValid(new Date())) {
                return HttpResult.notFound();
            }
            User user = userService.selectById(userToken.getUserId());
            return HttpResult.success(UserDTO.from(user));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error(String.format("查询用户[%s]错误", accessToken), e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 分页查询用户列表
     *
     * @param current
     * @param limit
     * @return
     */
    @GetMapping("/list")
    public HttpResult<PageResult<UserDTO>> getUserList(
            @RequestParam("current") Integer current, @RequestParam("limit") Integer limit,
            @RequestParam(value = "orgId",required = false) Integer orgId,
            @RequestParam("realName") String realName) {
        if (current == null || limit == null || current < 1 || limit < 1) {
            return HttpResult.parameterError("分页参数错误");
        }

        PageResult result = new PageResult(current, limit);
        try {
            EntityWrapper<User> userMapper = new EntityWrapper<>();
            if (StrUtil.isNotEmpty(realName)) {
                userMapper.like("real_name", realName + "%");
            }
            if(orgId != null) {
                userMapper.eq("org_id", orgId);
            }
            userMapper.orderBy("gmt_create",false);
            Page<User> list = userService.selectPage(new Page<>(current, limit), userMapper);
            result.setTotal((int) list.getTotal());
            result.setRecords(list.getRecords() == null ? null :
                    list.getRecords().stream().map(p -> UserDTO.from(p)).collect(Collectors.toList()));

            return HttpResult.success(result);
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询用户列表错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 查询个人菜单树形列表
     *
     * @param accessToken
     * @return
     */
    @GetMapping("/menu/list")
    public HttpResult<List<MenuTreeDTO>> getUserMenuTreeList(@RequestParam("accessToken") String accessToken) {
        List<MenuTreeBO> userMenuList = null;
        try {
            UserToken userToken = userTokenService.getById(accessToken);
            if (userToken == null || !userToken.isValid(new Date())) {
                return HttpResult.notFound();
            }
            User user = userService.selectById(userToken.getUserId());
            if (user.getAdmin()) {
                userMenuList = menuService.getMenuTreeList(1, 10000).getRecords();
            } else {
                userMenuList = menuService.getUserMenuList(userToken.getUserId());
            }
            return HttpResult.success(userMenuList == null ? null :
                    userMenuList.stream().map(b -> MenuTreeDTO.from(b)).collect(Collectors.toList()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询个人菜单树形列表错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 查询个人操作授权列表
     *
     * @param accessToken
     * @return
     */
    @GetMapping("/config/list")
    public HttpResult<List<DynamicConfigDTO>> getUserConfigList(@RequestParam("accessToken") String accessToken) {
        List<DynamicConfig> userConfigList = null;
        try {
            UserToken userToken = userTokenService.getById(accessToken);
            if (userToken == null || !userToken.isValid(new Date())) {
                return HttpResult.notFound();
            }
            User user = userService.selectById(userToken.getUserId());
            if (user.getAdmin()) {
                userConfigList = configService.getDynamicConfigList(1, 10000).getRecords();
            } else {
                userConfigList = configService.getUserConfigList(userToken.getUserId());
            }
            return HttpResult.success(userConfigList == null ? null :
                    userConfigList.stream().map(b -> DynamicConfigDTO.from(b)).collect(Collectors.toList()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询个人操作授权列表错误", e);
            return HttpResult.systemError("系统错误");
        }
    }


    /**
     * 设置用户为超级管理员
     * @param id
     * @return
     */
    @PostMapping("/setAdmin")
    public HttpResult<Boolean> setAdmin(@RequestParam("id") Integer id){
        if (id == null) {
            return HttpResult.parameterError();
        }
        try {
            User user = userService.selectById(id);
            if (user == null) {
                return HttpResult.notFound();
            }
            user.setAdmin(true);
            return HttpResult.success(userService.updateById(user));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error(String.format("查询用户[%d]错误", id), e);
            return HttpResult.systemError("系统错误");
        }
    }

    @PostMapping("/sendMessageByPhone")
    public HttpResult<Boolean> sendMessageByPhone(@RequestBody String requestJson) {
        JSONObject jsonObject = new JSONObject(requestJson);
        String mobile = jsonObject.getStr("mobile");
        String content = jsonObject.getStr("content");

        if (mobile == null || content == null) {
            return HttpResult.parameterError("参数错误mobile或content为空");
        }

        try {
            String response = wechatService.sendMessageByPhone(mobile, content);
            if (response != null) {
                JSONObject sendMessageResponse = new JSONObject(response);
                int errcode = sendMessageResponse.getInt("errcode", 1);
//                logger.error(String.format("给用户信息返回信息[%s]", response));
                return HttpResult.success(errcode == 0);
            }
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error(String.format("给用户信息失败，参数[%s]", requestJson), e);
        }
        return HttpResult.systemError("系统错误");
    }

    /**
     * 查询部门主管
     *
     * @param orgId
     * @return
     */
    @GetMapping("/organize/{orgId}/master/list")
    public HttpResult<List<UserDTO>> getOrganizeMasterList(@RequestParam("orgId") Integer orgId) {
        try {
            List<User> userList = userService.getDepartmentMasterList(orgId);
            return HttpResult.success(userList == null ? null :
                    userList.stream().map(UserDTO::from).collect(Collectors.toList()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询部门主管错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 查询部门主管
     *
     * @param orgId
     * @return
     */
    @GetMapping("/organize/{orgId}/master")
    public HttpResult<UserDTO> getOrganizeMaster(@RequestParam("orgId") Integer orgId) {
        try {
            User user = userService.getDepartmentMasterList(orgId).get(0);
            return HttpResult.success(UserDTO.from(user));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询部门主管错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 查询部门行政主管（用于审批流程）
     *
     * @param orgId
     * @return
     */
    @GetMapping("/organize/{orgId}/admin/list")
    public HttpResult<List<UserDTO>> getOrganizeAdminList(@RequestParam("orgId") Integer orgId) {
        try {
            List<User> userList = userService.getDepartmentAdminList(orgId);
            return HttpResult.success(userList == null ? null :
                    userList.stream().map(UserDTO::from).collect(Collectors.toList()));
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询部门行政主管错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 批量同步企微用户ID
     * 不传userIds时：查询所有手机号不为空且qywx_user_id为空的用户，通过企微API获取并绑定
     * 传userIds时：仅同步指定用户（手机号不为空的），已绑定的会被重新查询覆盖
     *
     * @param userIds 可选，逗号分隔的用户ID
     * @return 同步结果统计
     */
    @PostMapping("/syncQywxUserId")
    public HttpResult<Map<String, Object>> syncQywxUserId(
            @RequestParam(value = "userIds", required = false) String userIds) {
        Map<String, Object> result = new HashMap<>();
        int total = 0;
        int success = 0;
        int fail = 0;
        List<String> failList = new ArrayList<>();

        try {
            // 1. 组装查询条件
            EntityWrapper<User> wrapper = new EntityWrapper<>();
            wrapper.where("phone IS NOT NULL AND phone != ''");
            if (StrUtil.isNotBlank(userIds)) {
                List<Integer> ids = new ArrayList<>();
                for (String idStr : userIds.split(",")) {
                    if (StrUtil.isNotBlank(idStr)) {
                        ids.add(Integer.valueOf(idStr.trim()));
                    }
                }
                if (ids.isEmpty()) {
                    result.put("total", 0);
                    result.put("success", 0);
                    result.put("fail", 0);
                    return new HttpResult<>(HttpStatus.OK, "没有需要同步的用户", result);
                }
                wrapper.in("id", ids);
            } else {
                wrapper.andNew("(qywx_user_id IS NULL OR qywx_user_id = '')");
            }
            wrapper.eq("is_deleted", 0);
            List<User> userList = userService.selectList(wrapper);

            total = userList.size();
            if (total == 0) {
                result.put("total", 0);
                result.put("success", 0);
                result.put("fail", 0);
                return new HttpResult<>(HttpStatus.OK, "没有需要同步的用户", result);
            }

            logger.info("开始批量同步企微用户ID，共{}个用户", total);

            // 2. 逐个调用企微API获取userid并绑定
            for (User user : userList) {
                try {
                    String phone = user.getPhone();
                    if (StrUtil.isBlank(phone)) {
                        continue;
                    }
                    String response = wechatService.getUserIdByMobile(phone);
                    if (StrUtil.isNotBlank(response)) {
                        JSONObject jsonObject = new JSONObject(response);
                        int errcode = jsonObject.getInt("errcode", -1);
                        if (errcode == 0) {
                            String qywxUserId = jsonObject.getStr("userid");
                            if (StrUtil.isNotBlank(qywxUserId)) {
                                user.setQywxUserId(qywxUserId);
                                userService.updateById(user);
                                success++;
                                logger.info("同步企微ID成功: userId={}, phone={}, qywxUserId={}",
                                        user.getId(), phone, qywxUserId);
                            } else {
                                fail++;
                                failList.add(user.getRealName() + "(" + phone + "): 返回userid为空");
                                logger.warn("企微API返回userid为空: userId={}, phone={}", user.getId(), phone);
                            }
                        } else {
                            fail++;
                            String errMsg = jsonObject.getStr("errmsg", "未知错误");
                            failList.add(user.getRealName() + "(" + phone + "): " + errMsg);
                            logger.warn("获取企微userid失败: userId={}, phone={}, errcode={}, errmsg={}",
                                    user.getId(), phone, errcode, errMsg);
                        }
                    } else {
                        fail++;
                        failList.add(user.getRealName() + "(" + phone + "): API无响应");
                    }
                } catch (Exception e) {
                    fail++;
                    failList.add(user.getRealName() + "(" + user.getPhone() + "): " + e.getMessage());
                    logger.error("同步企微ID异常: userId={}", user.getId(), e);
                }
            }

            result.put("total", total);
            result.put("success", success);
            result.put("fail", fail);
            if (!failList.isEmpty()) {
                result.put("failList", failList);
            }

            logger.info("批量同步企微ID完成，总{}个，成功{}个，失败{}个", total, success, fail);
            return new HttpResult<>(HttpStatus.OK, "同步完成，成功" + success + "个，失败" + fail + "个", result);

        } catch (Exception e) {
            logger.error("批量同步企微ID失败", e);
            result.put("errorType", e.getClass().getName());
            result.put("errorMsg", e.getMessage());
            return new HttpResult<>(HttpStatus.INTERNAL_SERVER_ERROR,
                    "同步失败: " + e.getClass().getSimpleName() + " - " + e.getMessage(), result);
        }
    }

    /**
     * 企微OAuth免登录
     * 通过企微OAuth code获取用户身份并完成登录
     *
     * @param code 企微OAuth授权码
     * @param appId 应用ID
     * @return 登录信息
     */
    @GetMapping("/qywx/oauth")
    public HttpResult<UserLoginDTO> qywxOAuthLogin(@RequestParam("code") String code, @RequestParam("appId") String appId) {
        if (StrUtil.isBlank(code) || StrUtil.isBlank(appId)) {
            return HttpResult.parameterError("code或appId不能为空");
        }

        try {
            // 1. 通过code获取企微userid
            String qywxUserId = wechatService.getUserInfoByCode(code);
            if (StrUtil.isBlank(qywxUserId)) {
                return HttpResult.authError("企微授权失败，无法获取用户身份");
            }
            logger.info("企微OAuth获取到userid: {}", qywxUserId);

            // 2. 通过qywx_user_id查询系统用户
            User user = new User();
            user.setQywxUserId(qywxUserId);
            User dbUser = userService.selectOne(new EntityWrapper<>(user));

            // 3. 如果未绑定，尝试通过手机号获取userid来匹配
            if (dbUser == null) {
                // 通过企微userid获取用户详情（含手机号）
                String userDetailJson = wechatService.getUserDetailByUserId(qywxUserId);
                if (StrUtil.isNotBlank(userDetailJson)) {
                    JSONObject detailObj = new JSONObject(userDetailJson);
                    int errcode = detailObj.getInt("errcode", -1);
                    if (errcode == 0) {
                        String mobile = detailObj.getStr("mobile");
                        if (StrUtil.isNotBlank(mobile)) {
                            // 通过手机号查询系统用户
                            User phoneUser = new User();
                            phoneUser.setPhone(mobile);
                            dbUser = userService.selectOne(new EntityWrapper<>(phoneUser));
                            // 如果找到用户，自动绑定qywx_user_id
                            if (dbUser != null && StrUtil.isBlank(dbUser.getQywxUserId())) {
                                dbUser.setQywxUserId(qywxUserId);
                                userService.updateById(dbUser);
                                logger.info("自动绑定用户qywx_user_id: userId={}, qywxUserId={}", dbUser.getId(), qywxUserId);
                            }
                        }
                    }
                }
            }

            if (dbUser == null) {
                return HttpResult.authError("未找到对应的系统用户，请联系管理员绑定企微账号");
            }

            // 4. 调用企微免登录服务生成token（跳过密码校验）
            UserLoginBO loginBO = userService.qywxLogin(dbUser, appId, LOGIN_EXPIRE_TIME_SPAN_SECONDS);
            if (loginBO == null) {
                return HttpResult.authError("登录失败");
            }

            return HttpResult.success(UserLoginDTO.from(loginBO));
        } catch (Exception e) {
            logger.error("企微OAuth登录失败", e);
            return HttpResult.systemError("企微OAuth登录失败: " + e.getMessage());
        }
    }

    /**
     * 登出：吊销accessToken
     *
     * @param accessToken 登录token
     * @return 是否成功
     */
    @GetMapping("/logout")
    public HttpResult<Boolean> logout(@RequestParam("accessToken") String accessToken) {
        if (StrUtil.isBlank(accessToken)) {
            return HttpResult.parameterError("accessToken不能为空");
        }
        try {
            boolean deleted = userTokenService.deleteByToken(accessToken);
            return HttpResult.success(deleted);
        } catch (Exception e) {
            logger.error("登出吊销token失败, accessToken前缀={}", StrUtil.sub(accessToken, 0, 10), e);
            return HttpResult.systemError("登出失败: " + e.getMessage());
        }
    }

    @GetMapping("/wechat/pay/bill/list")
    public HttpResult<List<WechatExternalPayBillDTO>> getUserQyWechatPayBillList(@RequestParam("mobile") String mobile, @RequestParam("beginTime") String beginTime, @RequestParam("endTime") String endTime) {
        try {
            List<WechatExternalPayBillDTO> dtoList = wechatService.queryUserWechatBillList(mobile, beginTime, endTime);
            return HttpResult.success(dtoList);
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询员工企微收款信息错误", e);
            return HttpResult.systemError("系统错误");
        }
    }

    /**
     * 通过交易单号查询企微对外收款记录
     *
     * @param mobile 员工手机号
     * @param transactionId 企微交易单号
     * @return 收款记录
     */
    @GetMapping("/wechat/pay/bill/queryByTransactionId")
    public HttpResult<WechatExternalPayBillDTO> queryWechatBillByTransactionId(
            @RequestParam("mobile") String mobile,
            @RequestParam("transactionId") String transactionId) {
        try {
            if (StrUtil.isBlank(mobile) || StrUtil.isBlank(transactionId)) {
                return HttpResult.parameterError("手机号和交易单号不能为空");
            }
            WechatExternalPayBillDTO bill = wechatService.queryBillByTransactionId(mobile, transactionId);
            if (bill == null) {
                return HttpResult.notFound("未找到该交易单号的企微收款记录");
            }
            return HttpResult.success(bill);
        } catch (IllegalArgumentException e) {
            return HttpResult.parameterError(StrUtil.isBlank(e.getMessage()) ? "参数错误" : e.getMessage());
        } catch (Exception e) {
            logger.error("查询企微收款记录错误", e);
            return HttpResult.systemError("系统错误");
        }
    }
}
