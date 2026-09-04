import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly em: EntityManager) {}

  async findAll(): Promise<User[]> {
    return this.em.find(User, {}, { orderBy: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<User | null> {
    return this.em.findOne(User, { id });
  }
}
