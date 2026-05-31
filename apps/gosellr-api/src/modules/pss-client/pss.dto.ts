import { IsString, IsNotEmpty, IsArray, IsOptional, IsObject } from 'class-validator';

export class PssSubmitDto {
  @IsString() @IsNotEmpty() entity_id: string;
  @IsString() @IsNotEmpty() entity_type: string;
  @IsString() @IsNotEmpty() user_id: string;
  @IsString() @IsNotEmpty() platform_id: string;
  @IsObject() entity_data: Record<string, unknown>;
}

export class PssBulkStatusDto {
  @IsString() @IsNotEmpty() platform_id: string;
  @IsArray() entity_ids: string[];
}

export class PssVerifyUserDto {
  @IsString() @IsNotEmpty() user_id: string;
  @IsString() @IsNotEmpty() requesting_platform: string;
  @IsArray() @IsOptional() required_fields?: string[];
}
