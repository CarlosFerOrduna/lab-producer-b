CREATE TABLE item (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    quantity integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_item PRIMARY KEY (id),
    CONSTRAINT ck_item_quantity CHECK (quantity >= 0)
);

CREATE INDEX ix_item_created_at ON item (created_at);
