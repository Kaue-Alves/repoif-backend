import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListTeachersDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit: number = 12;

    @IsOptional()
    @IsString()
    search?: string;
}

export interface TeacherListItem {
    id: string;
    username: string;
    role: string;
    publicSubjectsCount: number;
}

export interface PaginatedTeachers {
    data: TeacherListItem[];
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
    };
}
