import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { ApproveDto, RejectDto } from './dto/action.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateStagesDto } from './dto/update-stages.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll() {
    return this.documentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.history(id);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  @Patch(':id/stages')
  updateStages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStagesDto,
  ) {
    return this.documentsService.updateStages(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveDto) {
    return this.documentsService.approve(id, dto.userId, dto.comment);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectDto) {
    return this.documentsService.reject(id, dto.userId, dto.comment);
  }
}
