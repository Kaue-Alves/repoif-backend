import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Extensões de arquivos executáveis/instaladores. São recusadas no upload porque
 * um material didático nunca precisa ser um binário executável, e um repositório
 * acadêmico é um vetor conveniente para distribuí-los.
 *
 * Extensões de código-fonte (.js, .ts, .py, .sh, .jar…) NÃO entram aqui de
 * propósito: o curso é de desenvolvimento de sistemas e compartilhar código é
 * caso de uso legítimo.
 */
export const BLOCKED_UPLOAD_EXTENSIONS = [
    'exe', 'msi', 'msp', 'msc', 'com', 'scr', 'pif', 'cpl', 'gadget',
    'bat', 'cmd', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'ws',
    'ps1', 'psm1', 'hta', 'lnk', 'scf', 'reg',
    'dll', 'sys', 'drv',
    'apk', 'dmg', 'app', 'deb', 'rpm',
] as const;

const BLOCKED = new Set<string>(BLOCKED_UPLOAD_EXTENSIONS);

/**
 * Última extensão do nome, em minúsculas. Espaços e pontos finais são removidos
 * antes porque o Windows os ignora ao resolver o executável — "virus.exe " roda
 * igual a "virus.exe".
 */
export function extractExtension(filename: string): string {
    const cleaned = filename.trim().replace(/[.\s]+$/, '');
    const dot = cleaned.lastIndexOf('.');
    if (dot <= 0) return '';
    return cleaned.slice(dot + 1).toLowerCase();
}

/** Só a última extensão importa: "trabalho.pdf.exe" é um .exe. */
export function isBlockedFilename(filename: string): boolean {
    return BLOCKED.has(extractExtension(filename));
}

export const BLOCKED_UPLOAD_MESSAGE =
    'Este tipo de arquivo não é permitido. Arquivos executáveis e instaladores ' +
    `(${BLOCKED_UPLOAD_EXTENSIONS.slice(0, 4).map(e => `.${e}`).join(', ')}, …) são bloqueados.`;

/** Recusa nomes de arquivo cuja extensão é executável. */
export function IsSafeFilename(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: 'isSafeFilename',
            target: object.constructor,
            propertyName,
            options: { message: BLOCKED_UPLOAD_MESSAGE, ...validationOptions },
            validator: {
                validate(value: unknown) {
                    return typeof value === 'string' && !isBlockedFilename(value);
                },
            },
        });
    };
}
