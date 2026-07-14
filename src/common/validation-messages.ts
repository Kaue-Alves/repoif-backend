import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

/**
 * Tradução das mensagens do class-validator para português.
 *
 * Motivo: o `httpClient` do frontend exibe `data.message` cru ao usuário (ver a
 * regra 6f do CLAUDE.md). Sem isto, quem erra o cadastro lê
 * "password must be longer than or equal to 8 characters" num sistema em português.
 *
 * Estratégia: cada regra reconhece o **texto padrão** do class-validator por regex.
 * Se o texto não casar, a mensagem foi customizada no DTO (como a do `@IsSafeFilename`
 * ou a do limite de upload) e é preservada como está. Ou seja: traduz-se o default,
 * nunca o que o autor do DTO escreveu à mão.
 *
 * ⚠️ Ao usar um decorator de validação novo, acrescente a regra dele aqui — senão a
 * mensagem padrão dele vaza em inglês para a tela. O teste `validation-messages.spec.ts`
 * trava os textos padrão: se uma atualização do class-validator mudar a redação, ele
 * reprova em vez de deixar o inglês passar despercebido.
 */

/** Nome da propriedade → como o usuário chama aquilo. */
const FIELD_LABELS: Record<string, string> = {
    username: 'nome de usuário',
    email: 'e-mail',
    password: 'senha',
    name: 'nome',
    title: 'título',
    description: 'descrição',
    content: 'conteúdo',
    reason: 'motivo',
    role: 'papel',
    status: 'situação',
    token: 'token',
    dueDate: 'data de entrega',
    filename: 'nome do arquivo',
    originalName: 'nome do arquivo',
    mimeType: 'tipo do arquivo',
    size: 'tamanho do arquivo',
    key: 'arquivo',
    isPublic: 'visibilidade',
    subjectId: 'disciplina',
    classroomId: 'turma',
    studentId: 'aluno',
    teacherId: 'professor',
    assignmentId: 'trabalho',
    expiresInMinutes: 'validade do convite',
    page: 'página',
    limit: 'itens por página',
    search: 'busca',
};

const label = (property: string) => FIELD_LABELS[property] ?? property;

interface Rule {
    /** Reconhece o texto padrão do class-validator para este constraint. */
    padrao: RegExp;
    traduzir: (campo: string, m: RegExpMatchArray) => string;
}

const RULES: Record<string, Rule> = {
    isString: {
        padrao: /^\S+ must be a string$/,
        traduzir: c => `O campo ${c} deve ser um texto.`,
    },
    isEmail: {
        padrao: /^\S+ must be an email$/,
        traduzir: () => 'Informe um e-mail válido.',
    },
    minLength: {
        padrao: /^\S+ must be longer than or equal to (\d+) characters$/,
        traduzir: (c, m) => `O campo ${c} deve ter no mínimo ${m[1]} caracteres.`,
    },
    maxLength: {
        padrao: /^\S+ must be shorter than or equal to (\d+) characters$/,
        traduzir: (c, m) => `O campo ${c} deve ter no máximo ${m[1]} caracteres.`,
    },
    isInt: {
        padrao: /^\S+ must be an integer number$/,
        traduzir: c => `O campo ${c} deve ser um número inteiro.`,
    },
    isUuid: {
        padrao: /^\S+ must be a UUID$/,
        traduzir: c => `O campo ${c} deve ser um identificador válido.`,
    },
    isBoolean: {
        padrao: /^\S+ must be a boolean value$/,
        traduzir: c => `O campo ${c} deve ser verdadeiro ou falso.`,
    },
    isEnum: {
        padrao: /^\S+ must be one of the following values: (.+)$/,
        traduzir: (c, m) => `O campo ${c} deve ser um destes valores: ${m[1]}.`,
    },
    isIn: {
        padrao: /^\S+ must be one of the following values: (.+)$/,
        traduzir: (c, m) => `O campo ${c} deve ser um destes valores: ${m[1]}.`,
    },
    max: {
        padrao: /^\S+ must not be greater than (.+)$/,
        traduzir: (c, m) => `O campo ${c} deve ser no máximo ${m[1]}.`,
    },
    min: {
        padrao: /^\S+ must not be less than (.+)$/,
        traduzir: (c, m) => `O campo ${c} deve ser no mínimo ${m[1]}.`,
    },
    isDateString: {
        padrao: /^\S+ must be a valid ISO 8601 date string$/,
        traduzir: c => `O campo ${c} deve ser uma data válida.`,
    },
    isDate: {
        padrao: /^\S+ must be a Date instance$/,
        traduzir: c => `O campo ${c} deve ser uma data válida.`,
    },
    isNotEmpty: {
        padrao: /^\S+ should not be empty$/,
        traduzir: c => `O campo ${c} é obrigatório.`,
    },
    whitelistValidation: {
        padrao: /^property \S+ should not exist$/,
        traduzir: c => `O campo ${c} não é aceito nesta requisição.`,
    },
};

/** Traduz um constraint; devolve a mensagem original se ela foi customizada no DTO. */
function traduzirConstraint(property: string, chave: string, original: string): string {
    const rule = RULES[chave];
    if (!rule) return original;

    const m = original.match(rule.padrao);
    if (!m) return original; // Mensagem escrita à mão no DTO — respeita-se.

    return rule.traduzir(label(property), m);
}

/** Achata a árvore de erros (DTOs aninhados têm `children`) numa lista de mensagens. */
export function toPortugueseMessages(errors: ValidationError[]): string[] {
    const mensagens: string[] = [];

    const visitar = (erro: ValidationError) => {
        for (const [chave, texto] of Object.entries(erro.constraints ?? {})) {
            mensagens.push(traduzirConstraint(erro.property, chave, texto));
        }
        for (const filho of erro.children ?? []) {
            visitar(filho);
        }
    };

    errors.forEach(visitar);
    return mensagens;
}

/** `exceptionFactory` do ValidationPipe global. */
export function portugueseValidationException(errors: ValidationError[]): BadRequestException {
    return new BadRequestException(toPortugueseMessages(errors));
}
