import { Body, CacheTTL, Controller, Post, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AddressTag } from 'src/common/entity/CommonModule/addressTag.entity';
import { WalletLabelConfig } from 'src/common/label/wallet-label/walletLabelConfig';
import { HttpCacheInterceptor } from 'src/common/interceptor/HttpCacheInterceptor';
import { AddressTagResponse } from 'src/viewModel/chain/AddressTagResponse';
import { ConfigManageService } from './config-manage.service';

@ApiTags('config')
@Controller('config-manage')
export class ConfigManageController {
  constructor(private readonly service: ConfigManageService) { }

  @Post('/getWalletLabelConfig')
  @ApiOperation({ summary: 'get wallet label configuration' })
  async getWalletLabelConfig(): Promise<WalletLabelConfig> {
    let config = await this.service.getWalletLabelConfig();
    return config;
  }

  @Post('/updateWalletLabelConfig')
  @ApiOperation({ summary: 'update wallet label configuration' })
  async updateWalletLabelConfig(@Body() body: WalletLabelConfig): Promise<any> {
    let result = await this.service.updateWalletLabelConfig(body);
    return result;
  }

  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(60)
  @Post('/getAddressTagList')
  @ApiOperation({ summary: '' })
  getAddressTagList(@Body() request: any): Promise<AddressTagResponse> {
    return this.service.getAddressTagList(request);
  }
  @Post('/updateAddressTag')
  @ApiOperation({ summary: 'update address tag' })
  updateAddressTag(@Body() request: AddressTag): Promise<AddressTag> {
    return this.service.updateAddressTag(request);
  }
  @Post('/removeAddressTag')
  @ApiOperation({ summary: 'remove address tag' })
  removeAddressTag(@Body() request: AddressTag): Promise<boolean> {
    return this.service.removeAddressTag(request);
  }
}
