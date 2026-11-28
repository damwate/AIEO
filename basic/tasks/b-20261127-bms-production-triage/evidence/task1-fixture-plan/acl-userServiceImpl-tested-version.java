package com.ecog.acl.service.impl;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.date.DateTime;
import cn.hutool.core.util.StrUtil;
import cn.hutool.crypto.SecureUtil;
import com.baomidou.mybatisplus.mapper.EntityWrapper;
import com.baomidou.mybatisplus.mapper.Wrapper;
import com.baomidou.mybatisplus.plugins.Page;
import com.baomidou.mybatisplus.service.impl.ServiceImpl;
import com.ecog.acl.bo.UserBO;
import com.ecog.acl.bo.UserLoginBO;
import com.ecog.acl.common.enums.RelationType;
import com.ecog.acl.dao.DistrictDao;
import com.ecog.acl.dao.RoleDao;
import com.ecog.acl.dao.UserDao;
import com.ecog.acl.dao.UserTokenDao;
import com.ecog.acl.entity.*;
import com.ecog.acl.exception.SystemException;
import com.ecog.acl.service.OrganizeService;
import com.ecog.acl.service.RelationService;
import com.ecog.acl.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Created by daming on 2018/12/11.
 * @author daming
 */
@Service
public class UserServiceImpl extends ServiceImpl<UserDao, User> implements UserService {

    @Autowired
    private UserDao userDao;

    @Autowired
    private DistrictDao districtDao;

    @Autowired
    private RoleDao roleDao;

    @Autowired
    private UserTokenDao userTokenDao;

    @Autowired
    private OrganizeService organizeService;

    @Autowired
    private RelationService relationService;

    /**
     * 新增用户
     *
     * @param user
     * @return
     */
    @Override
    public boolean addUser(User user) {
        if (StrUtil.isBlank(user.getUserName()) || user.getOrgId() == null) {
            throw new IllegalArgumentException();
        }
        //检查用户名是否已存在
        User user1 = new User();
        user1.setUserName(user.getUserName());
        if (userDao.selectOne(user1) == null) {
            user.setPassWord(getMd5Code(user.getPassWord(), user.getUserKey()));
            Organize org = organizeService.selectById(user.getOrgId());
            user.setDistrictId(org.getDistrictId());
            return user.insert();
        } else {
            throw new IllegalArgumentException("用户名已存在");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean addUser(User user, List<Integer> masterOrgIds) {
        boolean result = addUser(user);
        if (masterOrgIds != null) {
            syncMasterOrgs(user.getId(), masterOrgIds);
        }
        return result;
    }

    @Override
    public boolean modifyUser(User user) {
        User dUser = selectById(user.getId());
        if (dUser == null) {
            throw new IllegalArgumentException("用户不存在");
        }
        if (StrUtil.isBlank(user.getUserName())) {
            throw new IllegalArgumentException();
        }
        if (StrUtil.isNotEmpty(user.getPhone())) {
            dUser.setPhone(user.getPhone());
        }
        if (StrUtil.isNotEmpty(user.getMailAddress())) {
            dUser.setMailAddress(user.getMailAddress());
        }
        if (StrUtil.isNotEmpty(user.getRealName())) {
            dUser.setRealName(user.getRealName());
        }
        if (StrUtil.isNotEmpty(user.getUserKey())) {
            dUser.setUserKey(user.getUserKey());
        }
        if (StrUtil.isNotEmpty(user.getUserName())) {
            dUser.setUserName(user.getUserName());
        }
        if (StrUtil.isNotEmpty(user.getPassWord())) {
            dUser.setPassWord(getMd5Code(user.getPassWord(), user.getUserKey()));
        }
        if (user.getOrgId() != null && user.getOrgId() > 0 && !user.getOrgId().equals(dUser.getOrgId())) {
            dUser.setOrgId(user.getOrgId());
            Organize org = organizeService.selectById(user.getOrgId());
            user.setDistrictId(org.getDistrictId());
        }
        return dUser.updateById();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public boolean modifyUser(User user, List<Integer> masterOrgIds) {
        boolean result = modifyUser(user);
        if (masterOrgIds != null) {
            syncMasterOrgs(user.getId(), masterOrgIds);
        }
        return result;
    }

    /**
     * 同步用户的主管部门关系（relation_mapping, organize_user）
     * object_id_from = 组织ID, object_id_to = 用户ID
     *
     * @param userId
     * @param masterOrgIds 为空列表表示清空全部主管部门
     */
    private void syncMasterOrgs(Integer userId, List<Integer> masterOrgIds) {
        relationService.deleteRelationByIdTo(userId, RelationType.Organize_User);
        if (masterOrgIds == null || masterOrgIds.isEmpty()) {
            return;
        }
        for (Integer orgId : masterOrgIds) {
            if (orgId == null || orgId <= 0) {
                continue;
            }
            if (!relationService.addRelation(orgId, java.util.Collections.singletonList(userId), RelationType.Organize_User)) {
                throw new RuntimeException("主管部门关系保存不成功.");
            }
        }
    }

    @Override
    public UserBO getUser(int id){
        User user = this.selectById(id);
        return toBO(user);
    }

    /**
     * 用户登录
     *
     * @param userName
     * @param passWord
     * @param appId
     * @return
     * @throws SystemException
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserLoginBO userLogin(String userName, String passWord, String appId, long expireTimeSpan) {
        User user = new User();
        user.setUserName(userName);
        User user1 = userDao.selectOne(user);
        //用户名存在
        if (user1 != null) {
            Integer userId = user1.getId();
            //检查密码
            if (user1.getPassWord().equals(getMd5Code(passWord, user1.getUserKey()))) {
                //保留其他设备/场景的有效token，多会话并存
                //生成新token
                long lExpireTime = DateTime.now().getTime() + expireTimeSpan * 1000;
                DateTime expireTime = new DateTime(lExpireTime);
                String accessToken = getUserAccessToken();
                UserToken token = new UserToken();
                token.setId(accessToken);
                token.setAppId(appId);
                token.setExpireTime(expireTime);
                token.setUserId(userId);
                //写入新token
                if (token.insert()) {
                    UserLoginBO loginBO = UserLoginBO.from(user1);
                    //获取用户管理区域
                    List<District> districtList = districtDao.selectByUserId(userId,RelationType.District_User.getName());
                    if(CollUtil.isNotEmpty(districtList)){
                        loginBO.setDistrictManages(districtList.stream().map(p->p.getCode().toString()).collect(Collectors.joining(",")));
                    }else{
                        loginBO.setDistrictManages("");
                    }
                    //获取用户角色值
                    int roleValue = 0;
                    List<Role> roleList = roleDao.selectByUserId(userId, RelationType.Role_User.getName());
                    if(CollUtil.isNotEmpty(roleList)){
                        for(int i=0;i<roleList.size();i++){
                            roleValue = roleValue|roleList.get(i).getValue();
                        }
                    }
                    loginBO.setRoleValue(roleValue);
                    loginBO.setAccessToken(accessToken);
                    return loginBO;
                }
            }
        }
        return null;
    }

    /**
     * 修改用户密码
     *
     * @param userName
     * @param passWord
     * @param newPassword
     * @return
     * @throws SystemException
     */
    @Override
    public boolean modifyPassword(String userName, String passWord, String newPassword) {
        User user = new User();
        user.setUserName(userName);
        User user1 = userDao.selectOne(user);
        if (user1 == null) {
            throw new IllegalArgumentException("用户名不存在");
        }

        String dbPassword = user1.getPassWord();
        String userKey = user1.getUserKey();

        // 检查密码 - 使用用户原有的 userKey
        if (dbPassword.equals(getMd5Code(passWord, userKey))) {
            user1.setPassWord(getMd5Code(newPassword, userKey));
            return user1.updateById();
        }

        // 兼容旧数据：使用空 userKey
        if (dbPassword.equals(getMd5Code(passWord, ""))) {
            user1.setPassWord(getMd5Code(newPassword, userKey));
            return user1.updateById();
        }

        throw new IllegalArgumentException("原密码不正确");
    }

    @Override
    public boolean checkUserIsAdmin(Integer id, String superRoleCode) {
        return userDao.countByUserIdAndRoleCode(id, RelationType.Role_User.getName(), superRoleCode) > 0;
    }

    @Override
    public List<User> getDepartmentMasterList(Integer orgId){
        return userDao.selectByRoleId(orgId,RelationType.Organize_User.getName());
    }

    @Override
    public List<User> getDepartmentAdminList(Integer orgId){
        return userDao.selectByRoleId(orgId,RelationType.Admin_User.getName());
    }

    /**
     * 企微OAuth免登录
     * 跳过密码校验，直接生成token
     *
     * @param user
     * @param appId
     * @param expireTimeSpan
     * @return
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public UserLoginBO qywxLogin(User user, String appId, long expireTimeSpan) {
        Integer userId = user.getId();
        //保留其他设备/场景的有效token，多会话并存
        //生成新token
        long lExpireTime = DateTime.now().getTime() + expireTimeSpan * 1000;
        DateTime expireTime = new DateTime(lExpireTime);
        String accessToken = getUserAccessToken();
        UserToken token = new UserToken();
        token.setId(accessToken);
        token.setAppId(appId);
        token.setExpireTime(expireTime);
        token.setUserId(userId);
        //写入新token
        if (token.insert()) {
            UserLoginBO loginBO = UserLoginBO.from(user);
            //获取用户管理区域
            List<District> districtList = districtDao.selectByUserId(userId, RelationType.District_User.getName());
            if (CollUtil.isNotEmpty(districtList)) {
                loginBO.setDistrictManages(districtList.stream().map(p -> p.getCode().toString()).collect(Collectors.joining(",")));
            } else {
                loginBO.setDistrictManages("");
            }
            //获取用户角色值
            int roleValue = 0;
            List<Role> roleList = roleDao.selectByUserId(userId, RelationType.Role_User.getName());
            if (CollUtil.isNotEmpty(roleList)) {
                for (int i = 0; i < roleList.size(); i++) {
                    roleValue = roleValue | roleList.get(i).getValue();
                }
            }
            loginBO.setRoleValue(roleValue);
            loginBO.setAccessToken(accessToken);
            return loginBO;
        }
        return null;
    }

    /**
     * 密码生成
     * md5加密方式=userKey+password后再加密
     *
     * @param password
     * @param userKey
     * @return
     */
    private String getMd5Code(String password, String userKey) {
        return SecureUtil.md5(userKey + password).toUpperCase();
    }

    /**
     * 生成安全随机的32位登录token，避免并发登录共享或冲突
     *
     * @return 32位随机token
     */
    private String getUserAccessToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private UserBO toBO(User user) {
        if (user == null) {
            return null;
        }
        UserBO bo = new UserBO();
        BeanUtil.copyProperties(user, bo);
        Organize organize = organizeService.selectById(user.getOrgId());
        bo.setOrganize(organize);
        return bo;
    }
}
