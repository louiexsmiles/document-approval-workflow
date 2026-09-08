import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Text is trimmed before validation. IsNotEmpty rejects an empty string but accepts one
 * made only of spaces, which would let a rejection through with no usable reason.
 */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class ApproveDto {
  @IsUUID()
  userId!: string;

  @trimmed()
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  comment?: string;
}

export class RejectDto {
  @IsUUID()
  userId!: string;

  /** Required. A rejection with no reason gives the author nothing to act on. */
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;
}
