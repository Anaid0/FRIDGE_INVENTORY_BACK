import { Guard } from '../shared/Guard';

export interface CategoryProps {
  id: string;
  name: string;
  createdAt: Date;
}

const NAME_MAX = 80;

export class Category {
  private constructor(private props: CategoryProps) {}

  static create(input: { id: string; name: string; now: Date }): Category {
    return new Category({
      id: input.id,
      name: Guard.requiredText(input.name, 'name', NAME_MAX),
      createdAt: input.now,
    });
  }

  static restore(props: CategoryProps): Category {
    return new Category({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  rename(name: string): void {
    this.props.name = Guard.requiredText(name, 'name', NAME_MAX);
  }
}
