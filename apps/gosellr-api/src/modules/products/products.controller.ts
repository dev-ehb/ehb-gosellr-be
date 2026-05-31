import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request,
  HttpCode, HttpStatus, ForbiddenException, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery,
  ApiProperty, ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsString, IsNotEmpty, IsNumber, IsArray,
  IsOptional, IsBoolean, Min, ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserDocument } from '../users/user.schema';

class CreateProductDto {
  @ApiProperty({ example: 'Samsung Galaxy S24' })
  @IsString() @IsNotEmpty() title: string;

  @ApiProperty({ example: 'Brand new sealed box. 256GB storage.' })
  @IsString() @IsNotEmpty() description: string;

  @ApiProperty({ example: 85000 })
  @IsNumber() @Min(0) @Type(() => Number) price: number;

  @ApiProperty({ enum: ['Electronics', 'Clothing', 'Books', 'Home & Garden', 'Sports', 'Other'] })
  @IsString() @IsNotEmpty() category: string;

  @ApiPropertyOptional({ type: [String], example: ['https://example.com/img1.jpg'] })
  @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @IsOptional()
  images: string[] = [];

  @ApiPropertyOptional({ example: 10 })
  @IsNumber() @Min(0) @IsOptional() @Type(() => Number)
  stock = 0;
}

class UpdateProductDto {
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() @Type(() => Number) price?: number;
  @ApiPropertyOptional() @IsString() @IsOptional() category?: string;
  @ApiPropertyOptional({ type: [String] }) @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @IsOptional() images?: string[];
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() @Type(() => Number) stock?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() is_active?: boolean;
}

interface AuthReq extends Request {
  user: UserDocument;
}

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse products (public). status=approved by default; status=all returns every active product.' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'q', required: false, description: 'Free-text search across title + description' })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'popular', 'price_asc', 'price_desc'] })
  @ApiQuery({ name: 'seller_id', required: false, description: 'Filter to a single seller (brand store)' })
  @ApiQuery({ name: 'status', required: false, enum: ['approved', 'all'] })
  getProducts(
    @Query('category') category?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
    @Query('q') q?: string,
    @Query('sort') sort?: 'newest' | 'popular' | 'price_asc' | 'price_desc',
    @Query('seller_id') seller_id?: string,
    @Query('status') status?: 'approved' | 'all',
  ) {
    return this.productsService.getApprovedProductsWithOwner({
      category, page, limit, q, sort, seller_id, status,
    });
  }

  @Get('categories')
  @ApiOperation({ summary: 'List approved-product categories with counts (public)' })
  getCategories() {
    return this.productsService.getCategoriesWithCounts();
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get seller\'s own products (all statuses)' })
  getMyProducts(
    @Request() req: AuthReq,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    return this.productsService.getMyProducts(sellerId, { page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single product detail (public)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Product not found' })
  getProduct(@Param('id') id: string) {
    return this.productsService.getProductByIdWithOwner(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product (seller only)' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Not a seller' })
  createProduct(@Request() req: AuthReq, @Body() dto: CreateProductDto) {
    if (req.user.role !== 'seller') throw new ForbiddenException('Only sellers can create products');
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    return this.productsService.createProduct(sellerId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a product (owner only)' })
  updateProduct(@Request() req: AuthReq, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    if (req.user.role !== 'seller') throw new ForbiddenException('Only sellers can update products');
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    return this.productsService.updateProduct(id, sellerId, dto);
  }

  @Post(':id/submit-sq')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit product for SQ approval (seller + owner only)' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid status for submission' })
  submitForSQ(@Request() req: AuthReq, @Param('id') id: string) {
    if (req.user.role !== 'seller') throw new ForbiddenException('Only sellers can submit products for SQ');
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    return this.productsService.submitForSQ(id, sellerId);
  }

  @Get(':id/sq-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get SQ status from PSS (owner only)' })
  getSQStatus(@Request() req: AuthReq, @Param('id') id: string) {
    const sellerId = (req.user._id as unknown as { toString(): string }).toString();
    return this.productsService.getSQStatus(id, sellerId);
  }
}
