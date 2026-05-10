import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, In, Repository } from 'typeorm';
import { Task } from './task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ChangeTaskStatusDto } from './dto/change-task-status.dto';
import { TaskStatus, UserRole } from '@aegiscase/enums';
import { PaginationDto } from '@aegiscase/dto';
import { JwtPayload } from '@aegiscase/common';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly repo: Repository<Task>,
  ) {}

  async create(dto: CreateTaskDto, actor: JwtPayload): Promise<Task> {
    const task = this.repo.create({
      ...dto,
      status: TaskStatus.PENDING,
      assignedByUserId: actor.sub,
      createdByUserId: actor.sub,
    });
    return this.repo.save(task);
  }

  async findAll(pagination: PaginationDto, assignedToUserId?: string): Promise<[Task[], number]> {
    const { page = 1, limit = 20 } = pagination;
    await this.markOverdueTasks();

    const where = assignedToUserId ? { assignedToUserId } : {};
    return this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findOne(id: string): Promise<Task> {
    await this.markOverdueTasks();
    const task = await this.repo.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto, actor: JwtPayload): Promise<Task> {
    const task = await this.findOne(id);
    this.assertNotTerminal(task);

    if (actor.role === UserRole.ANALYST && task.assignedToUserId !== actor.sub) {
      throw new ForbiddenException('Analysts can only update their own tasks');
    }

    Object.assign(task, dto);
    return this.repo.save(task);
  }

  async changeStatus(id: string, dto: ChangeTaskStatusDto, actor: JwtPayload): Promise<Task> {
    const task = await this.findOne(id);

    if (task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException('A completed task cannot be reopened');
    }

    if (dto.status === TaskStatus.CANCELLED && actor.role === UserRole.ANALYST) {
      throw new ForbiddenException('Analysts cannot cancel tasks');
    }

    if (actor.role === UserRole.ANALYST && task.assignedToUserId !== actor.sub) {
      throw new ForbiddenException('Analysts can only update their own tasks');
    }

    task.status = dto.status;
    return this.repo.save(task);
  }

  private async markOverdueTasks(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    await this.repo.update(
      {
        dueDate: LessThan(today) as any,
        status: Not(In([TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.OVERDUE])),
      },
      { status: TaskStatus.OVERDUE },
    );
  }

  private assertNotTerminal(task: Task): void {
    if (task.status === TaskStatus.COMPLETED || task.status === TaskStatus.CANCELLED) {
      throw new BadRequestException(`Cannot modify a ${task.status.toLowerCase()} task`);
    }
  }
}
