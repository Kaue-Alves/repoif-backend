import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { AuthGuard } from 'src/auth/auth.guard';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './report.dto';

@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {

    constructor(private readonly reportsService: ReportsService) {}

    @Post()
    async create(@Body() dto: CreateReportDto, @Req() request: Request & { user: { sub: string } }) {
        return this.reportsService.create(dto, request.user.sub);
    }

    @Get('me')
    async findMine(@Req() request: Request & { user: { sub: string } }) {
        return this.reportsService.findMyReports(request.user.sub);
    }
}
