import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class AuthGuard implements CanActivate {

  private readonly jwtSecret: string

  constructor(
    private readonly jwtService: JwtService, 
    private readonly configService: ConfigService
  ){
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') ?? ''
  }
  
  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {

    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>()

    if (!this.jwtSecret) {
      throw new InternalServerErrorException()
    }

    const token = this.extractTokenFromHeader(request)

    if(!token) {
      throw new UnauthorizedException()
    }

    try {

      const payload = await this.jwtService.verifyAsync(
        token,
        {secret: this.jwtSecret}
      )

      request['user'] = payload
    } catch {
        throw new UnauthorizedException()
    }

    return true
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authorization = request.headers.authorization
    const headerValue = Array.isArray(authorization) ? authorization[0] : authorization
    const [type, token] = headerValue?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
