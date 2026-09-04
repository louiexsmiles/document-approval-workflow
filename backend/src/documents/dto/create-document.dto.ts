import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsUUID()
  draftReviewApproverId!: string;

  @IsUUID()
  legalReviewApproverId!: string;

  @IsUUID()
  finalApprovalApproverId!: string;
}
