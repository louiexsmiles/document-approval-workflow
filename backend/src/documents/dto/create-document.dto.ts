import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { StageApprovalPolicy } from '../stage-approval-policy.enum';
import { StageRejectBehavior } from '../stage-reject-behavior.enum';

/** Same reason as the action DTOs: a name of only spaces would otherwise pass. */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

export class CreateStageDto {
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  /** A stage nobody can approve would block the document forever. */
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  approverIds!: string[];

  @IsEnum(StageApprovalPolicy)
  @IsOptional()
  policy?: StageApprovalPolicy;

  @IsEnum(StageRejectBehavior)
  @IsOptional()
  rejectBehavior?: StageRejectBehavior;

  /**
   * Which stage a rejection here sends the document back to, by position. Only read when
   * rejectBehavior is TO_SPECIFIC_STAGE. A position rather than an id because no stage has
   * an id until the document is created.
   */
  @IsInt()
  @Min(0)
  @IsOptional()
  rejectTargetPosition?: number;
}

export class CreateDocumentDto {
  @trimmed()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @trimmed()
  @IsString()
  @IsNotEmpty()
  body!: string;

  /**
   * The document's workflow, in order. At least one stage: a document with nothing to
   * approve would be created already finished, which is never what anyone meant.
   *
   * ValidateNested and Type are both required — without them class-validator treats the
   * array as plain objects and skips every rule inside CreateStageDto.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateStageDto)
  stages!: CreateStageDto[];
}
