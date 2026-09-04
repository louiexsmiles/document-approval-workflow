import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { ActionDto } from './dto/action.dto';
import { CreateDocumentDto } from './dto/create-document.dto';

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

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  @Post(':id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActionDto,
  ) {
    return this.documentsService.approve(id, dto.userId);
  }

  @Post(':id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActionDto,
  ) {
    return this.documentsService.reject(id, dto.userId);
  }
}
