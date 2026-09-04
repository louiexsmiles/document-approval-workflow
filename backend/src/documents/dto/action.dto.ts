import { IsUUID } from 'class-validator';

export class ActionDto {
  @IsUUID()
  userId!: string;
}
