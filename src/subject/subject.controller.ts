import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SubjectService } from './subject.service';
import { SubjectDto } from './subject.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

@Controller('subjects')
export class SubjectController {
    constructor(private readonly subjectService: SubjectService) {}

    @UseGuards(AuthGuard)
    @Post()
    async create(@Body() subjectDto: SubjectDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.create(subjectDto, teacherId);
    }

    @UseGuards(AuthGuard)
    @Get()
    async findAll(@Query() query: PaginationQueryDto, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.findAll(teacherId, query);
    }

    @UseGuards(AuthGuard)
    @Get(':id')
    async findOne(@Param('id') id: string, @Req() request: any) {
        const userId = request.user.sub;
        return await this.subjectService.findOneForViewer(id, userId);
    }

    @UseGuards(AuthGuard)
    @Patch(':id')
    async update(@Param('id') id: string, @Body() subjectDto: Partial<SubjectDto>, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.update(id, subjectDto, teacherId);
    }

    @UseGuards(AuthGuard)
    @Delete(':id')
    async remove(@Param('id') id: string, @Req() request: any) {
        const teacherId = request.user.sub;
        return await this.subjectService.remove(id, teacherId);
    }
}

