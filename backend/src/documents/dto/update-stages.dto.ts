import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateStageDto } from './create-document.dto';

export class UpdateStageDto extends CreateStageDto {
  /**
   * Present for a stage that already exists, absent for one being added. Omitting a stage
   * from the list deletes it.
   */
  @IsUUID()
  @IsOptional()
  id?: string;
}

export class UpdateStagesDto {
  /**
   * The workflow as it should end up, in order — not a list of edits. The client holds the
   * whole list and sends it back, so one request either applies or does not. Three separate
   * add/remove/reorder endpoints would mean three chances to half-apply.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateStageDto)
  stages!: UpdateStageDto[];
}
