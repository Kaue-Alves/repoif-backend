import { plainToInstance } from 'class-transformer';
import {
    IsBoolean,
    IsDate,
    IsDateString,
    IsEmail,
    IsEnum,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
    validateSync,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { toPortugueseMessages } from './validation-messages';

enum PapelFake {
    A = 'A',
    B = 'B',
}

/** Cobre todos os decorators de validação em uso no projeto. */
class TodosOsDecoratorsDto {
    @IsString() username!: unknown;
    @IsEmail() email!: unknown;
    @MinLength(8) password!: string;
    @MaxLength(4) title!: string;
    @IsInt() page!: unknown;
    @IsUUID() subjectId!: unknown;
    @IsBoolean() isPublic!: unknown;
    @IsEnum(PapelFake) role!: unknown;
    @IsIn([1, 2]) status!: unknown;
    @Max(10) size!: number;
    @Min(2) limit!: number;
    @IsDateString() dueDate!: unknown;
    @IsDate() createdAt!: unknown;
    @IsNotEmpty() reason!: unknown;
}

const TUDO_INVALIDO = {
    username: 1,
    email: 'nao-eh-email',
    password: 'abc',
    title: 'texto longo demais',
    page: 'x',
    subjectId: 'x',
    isPublic: 'x',
    role: 'Z',
    status: 9,
    size: 99,
    limit: 0,
    dueDate: 'x',
    createdAt: 'x',
    reason: '',
};

const mensagensDe = (dto: object, payload: object) =>
    toPortugueseMessages(validateSync(plainToInstance(dto as never, payload)));

describe('toPortugueseMessages()', () => {
    const mensagens = () => mensagensDe(TodosOsDecoratorsDto, TUDO_INVALIDO);

    /**
     * A garantia que interessa: o `httpClient` mostra `data.message` cru, então
     * nenhuma mensagem pode chegar ao usuário com a redação padrão em inglês.
     */
    it('nenhuma mensagem escapa em inglês', () => {
        for (const msg of mensagens()) {
            expect(msg).not.toMatch(/must be|must not|should not|longer than|shorter than/i);
        }
    });

    it('traduz cada decorator usado no projeto', () => {
        expect(mensagens()).toEqual([
            'O campo nome de usuário deve ser um texto.',
            'Informe um e-mail válido.',
            'O campo senha deve ter no mínimo 8 caracteres.',
            'O campo título deve ter no máximo 4 caracteres.',
            'O campo página deve ser um número inteiro.',
            'O campo disciplina deve ser um identificador válido.',
            'O campo visibilidade deve ser verdadeiro ou falso.',
            'O campo papel deve ser um destes valores: A, B.',
            'O campo situação deve ser um destes valores: 1, 2.',
            'O campo tamanho do arquivo deve ser no máximo 10.',
            'O campo itens por página deve ser no mínimo 2.',
            'O campo data de entrega deve ser uma data válida.',
            'O campo createdAt deve ser uma data válida.',
            'O campo motivo é obrigatório.',
        ]);
    });

    it('usa o nome da propriedade quando não há rótulo amigável', () => {
        class SemRotuloDto {
            @IsInt() campoDesconhecido!: unknown;
        }
        expect(mensagensDe(SemRotuloDto, { campoDesconhecido: 'x' })).toEqual([
            'O campo campoDesconhecido deve ser um número inteiro.',
        ]);
    });
});

describe('mensagens customizadas do DTO', () => {
    /**
     * Regra do tradutor: ele reconhece o texto *padrão* do class-validator. Uma
     * mensagem escrita à mão no DTO (como a do limite de upload ou a do
     * `@IsSafeFilename`) tem de passar intacta — senão a tradução automática
     * apagaria justamente a mensagem mais bem escrita.
     */
    it('preserva a mensagem escrita à mão, sem sobrescrevê-la', () => {
        class ComMensagemPropriaDto {
            @Max(100, { message: 'O arquivo excede o limite de 100 MB.' })
            size!: number;
        }
        expect(mensagensDe(ComMensagemPropriaDto, { size: 999 })).toEqual([
            'O arquivo excede o limite de 100 MB.',
        ]);
    });
});

describe('DTOs aninhados', () => {
    class AnexoDto {
        @IsString() filename!: unknown;
    }
    class ComAnexoDto {
        @ValidateNested()
        @Type(() => AnexoDto)
        attachment!: AnexoDto;
    }

    /** Sem descer nos `children`, o erro do campo aninhado sumiria da resposta. */
    it('alcança os erros dos objetos aninhados', () => {
        expect(mensagensDe(ComAnexoDto, { attachment: { filename: 1 } })).toEqual([
            'O campo nome do arquivo deve ser um texto.',
        ]);
    });
});
