import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { RepositoryConsts } from 'src/common/orm/repositoryConsts';
import { User } from 'src/common/entity/UserManagementModule/User.entity';
import { UserFavorite } from 'src/common/entity/UserManagementModule/UserFavorite.entity';
import { UserVerifyCode, UserVerifyCodeType } from 'src/common/entity/UserManagementModule/UserVerifyCode.entity';
import { UserInfo } from 'src/viewModel/UserManagement/UserInfo';
import { JwtService } from '@nestjs/jwt';
import { UserSignupRequest } from 'src/viewModel/UserManagement/UserSignupRequest';
import { UserInfoUpdateRequest } from 'src/viewModel/UserManagement/UserInfoUpdateRequest';
import { ChangePasswordRequest } from 'src/viewModel/UserManagement/ChangePasswordRequest';
import { EmailVerifyRequest } from 'src/viewModel/UserManagement/EmailVerifyRequest';
import { CodeVerifyRequest } from 'src/viewModel/UserManagement/CodeVerifyRequest';
import { Mailer } from 'src/email-support/Mailer';
import { AuthUser } from 'src/common/auth/authUser';
import { UserFavoriteRemoveRequest } from 'src/viewModel/UserManagement/UserFavoriteRemoveRequest';
import { IAuthService } from 'src/common/auth/IAuthService';
import { MyLogger } from 'src/common/log/logger.service';
import { UserAddressBundle } from 'src/common/entity/UserManagementModule/UserAddressBundle.entity';


const md5 = require('js-md5');

@Injectable()
export class UserService implements IAuthService {

  async verifyCode(request: CodeVerifyRequest): Promise<boolean> {
    let findCode = await this.userVerifyCodeRepository.findOne({
      where: {
        userId: request.userId,
        code: request.code,
        type: UserVerifyCodeType.ResetPassword
      }
    });
    if (findCode) {
      return true;
    }
    return false;
  }
  async verifyEmail(request: EmailVerifyRequest): Promise<UserInfo> {
    let findUser = await this.userRepository.findOne({
      where: {
        email: request.email,
      }
    });
    if (findUser) {
      let userInfo = await this.getUserInfo(findUser.userId);

      //generate verification code
      await this.clearCode(userInfo.userId, UserVerifyCodeType.ResetPassword);
      let newCode: UserVerifyCode = {
        userId: userInfo.userId,
        code: this.generateCode(6),
        type: UserVerifyCodeType.ResetPassword,
        time: new Date(),
        id: 0
      }
      await this.userVerifyCodeRepository.save(newCode);

      //send verfication code by email
      await this.sendEmail(UserVerifyCodeType.ResetPassword, userInfo.displayName, userInfo.email, newCode.code);


      return userInfo;
    }
    else {
      throw new BadRequestException('the email not exist');
    }
  }

  async changePassword(request: ChangePasswordRequest): Promise<boolean> {

    let findCode = await this.userVerifyCodeRepository.findOne({
      where: {
        userId: request.userId,
        code: request.code,
        type: UserVerifyCodeType.ResetPassword
      }
    });
    if (!findCode) {
      throw new BadRequestException('the verification code for change password not exist');
    }

    //change password
    let user = await this.getUser(request.userId);
    if (!user) {
      throw new BadRequestException('user not exist');
    }

    user.passwordHash = this.encryptPassword(user.loginName, request.newPassword);
    await this.userRepository.save(user);

    //remove verification code 
    await this.clearCode(user.userId, UserVerifyCodeType.ResetPassword);
    return true;
  }
  async addFavorite(userId: number, req: UserFavorite): Promise<number> {
    let newEntity: UserFavorite = {
      id: 0,
      userId: userId,
      type: req.type,
      link: req.link,
      linkUrl: req.linkUrl,
      time: req.time || new Date()
    }
    await this.userFavoriteRepository.save(newEntity);

    return newEntity.id;
  }
  async removeFavorite(userId: number, req: UserFavoriteRemoveRequest): Promise<number> {

    let findRecord = await this.userFavoriteRepository.findOne({
      where: {
        userId: userId,
        id: req.id
      }
    });
    if (findRecord) {
      await this.userFavoriteRepository.remove(findRecord);
      return findRecord.id;
    }
    else {
      return -1;
    }
  }
  async getUserFavorite(userId: number): Promise<UserFavorite[]> {
    let records = await this.userFavoriteRepository.find({
      where: {
        userId: userId
      }
    });
    return records;
  }
  async updateUserInfo(request: UserInfoUpdateRequest): Promise<UserInfo> {
    let user: User = await this.getUser(request.userId);
    if (!user) {
      throw new BadRequestException('user not exist');
    }
    user.displayName = request.displayName;
    user.imageBase64 = request.imageBase64;
    user.email = request.email;
    user.twitter = request.twitter;
    user.github = request.github;
    await this.userRepository.save(user);
    return await this.getUserInfo(user.userId);
  }
  async getUser(userId: number): Promise<User> {
    let user = await this.userRepository.findOne({
      where: { userId: userId }
    });
    return user;
  }

  async createAccount(request: UserSignupRequest): Promise<UserInfo> {
    let newUser: User = {
      userId: 0,
      allowLogin: 1,
      loginName: request.email,
      email: request.email,
      displayName: request.displayName,
      passwordHash: this.encryptPassword(request.email, request.password),
      imageBase64: '',
      isWeb3User: 0, twitter: '', github: '',
      last_login_time: new Date()
    }
    await this.userRepository.save(newUser);

    return await this.getUserInfo(newUser.userId);
  }
  async checkWeb3User(userName: string): Promise<AuthUser> {

    let findUser = await this.userRepository.findOne({ where: { loginName: userName, isWeb3User: 1 } })
    if (findUser == null) {
      let newUser: User = new User();
      newUser.allowLogin = 1;
      newUser.isWeb3User = 1;
      newUser.loginName = userName;
      newUser.displayName = userName;
      newUser.last_login_time = new Date();
      await this.userRepository.save(newUser);
      return { userId: newUser.userId, username: newUser.loginName };
    } else {
      findUser.last_login_time = new Date();
      await this.userRepository.save(findUser);
      return { userId: findUser.userId, username: findUser.loginName };
    }
  }

  async checkEmailExist(email: string): Promise<boolean> {
    const user = await this.userRepository.findOne({
      where: { email: email }
    });
    if (user) {
      return true;
    }
    return false;
  }


  constructor(
    private readonly jwtService: JwtService,
    @Inject(RepositoryConsts.USER_REPOSITORY)
    private userRepository: Repository<User>,
    @Inject(RepositoryConsts.USER_FAVORITE_REPOSITORY)
    private userFavoriteRepository: Repository<UserFavorite>,
    @Inject(RepositoryConsts.USER_VERIFY_CODE_REPOSITORY)
    private userVerifyCodeRepository: Repository<UserVerifyCode>,
    @Inject(RepositoryConsts.USER_ADDRESS_BUNDLE_REPOSITORY)
    private userAddressBundleRepository: Repository<UserAddressBundle>,
  ) {

  }
  async grantToken(user: AuthUser): Promise<string> {
    const payload = { username: user.username, sub: user.userId };
    // console.debug(payload);

    let token = this.jwtService.sign(payload);
    // console.debug(token);
    return token;

  }
  async validateUserInfo(username: string, password: string): Promise<UserInfo> {
    const user = await this.userRepository.findOne({
      where: { loginName: username }
    });
    if (user && this.verifyPassword(user.loginName, user.passwordHash, password)) {

      return {
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        imageBase64: user.imageBase64,
        twitter: user.twitter,
        github: user.github,
        isWeb3User: user.isWeb3User
      };
    }
    return null;
  }
  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await this.userRepository.findOne({
      where: { loginName: username }
    });
    if (user && this.verifyPassword(user.loginName, user.passwordHash, password)) {

      let authUser: AuthUser = { userId: user.userId, username: user.email };
      MyLogger.log(`validate user:${JSON.stringify(authUser)}`);

      return authUser;
    }
    MyLogger.error('username or password invalid, please check');
    throw new UnauthorizedException("username or password invalid, please check");
  }

  async getUserInfo(userId: number): Promise<UserInfo> {
    const user = await this.userRepository.findOne({
      where: { userId: userId }
    });
    delete user.passwordHash;
    return user;
  }

  verifyPassword(loginName: string, passwordHash: string, password: string) {
    let encrypt = this.encryptPassword(loginName, password);
    return encrypt === passwordHash;
  }
  encryptPassword(loginName: string, password: string): string {

    let encrypt = md5(loginName + password);
    return encrypt;
  }


  async clearCode(userId: number, type: UserVerifyCodeType) {
    await this.userVerifyCodeRepository.delete({ userId: userId, type: type });
  }

  generateCode(codeLength: number): string {
    let code = "";
    ////所有候选验证码的字符
    var codeChars = new Array(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);

    for (var i = 0; i < codeLength; i++) {
      var charNum = Math.floor((Math.random() * (new Date()).getTime()) % codeChars.length);
      code += codeChars[charNum];
    }
    return code;
  }

  sendEmail(verifyCodeType: UserVerifyCodeType, displayName: string, email: string, code: string) {
    let mailer = new Mailer();
    mailer.send({
      to: email,
      subject: 'Verification mail from web3go',
      html: '<p> hi ' + displayName + ' , <br>your are processing to reset the password , below is the verification code:<br><h1>' + code + '</h1><br> sent by web3go</p>'
    });
    return "email sent success";
  }


  async removeAddressBundle(userId: number, data: UserAddressBundle): Promise<Boolean> {
    let findExist = await this.userAddressBundleRepository.findOne({
      where: {
        user_id: userId,
        address_type: data.address_type,
        address: data.address
      }
    });
    if (findExist) {
      await this.userAddressBundleRepository.remove(findExist);
      return true;
    }
    return false;
  }
  async addAddressBundle(userId: number, data: UserAddressBundle): Promise<UserAddressBundle> {
    let findExist = await this.userAddressBundleRepository.findOne({
      where: {
        user_id: userId,
        address_type: data.address_type,
        address: data.address
      }
    });
    if (!findExist) {
      data.user_id = userId;
      await this.userAddressBundleRepository.save(data);
      return data;
    }
    return findExist;
  }
  async getAddressBundle(userId: number): Promise<UserAddressBundle[]> {
    return await this.userAddressBundleRepository.find({
      where: { user_id: userId }
    })
  }
}
