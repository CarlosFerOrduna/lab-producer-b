import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('item')
@Index('ix_item_created_at', ['createdAt'])
export class ItemEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id', primaryKeyConstraintName: 'pk_item' })
  id: string;

  @Column('varchar', { name: 'name', length: 100 })
  name: string;

  @Column('integer', { name: 'quantity' })
  quantity: number;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
