import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HomeService } from './home.service';

/**
 * Public landing-page endpoints. All routes are unauthenticated since
 * the home page is publicly browsable.
 */
@ApiTags('Home')
@Controller('home')
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get('banners')
  @ApiOperation({ summary: 'Hero carousel slides + promo tiles for the landing page' })
  getBanners() {
    return this.homeService.getBanners();
  }

  @Get('featured-brands')
  @ApiOperation({ summary: 'Featured brand stores shown on the landing page' })
  getFeaturedBrands() {
    return this.homeService.getFeaturedBrands();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Trust-strip stats (SQ-verified %, industries covered, etc.)' })
  getStats() {
    return this.homeService.getStats();
  }
}
