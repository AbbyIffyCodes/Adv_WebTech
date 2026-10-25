# E-Shop API — NestJS + PostgreSQL + TypeORM

A small E-Shop REST API prepared for the database/migration lab task. It contains three project entities: **Users**, **Products**, and **Orders**. The Admin, Customer, and Employee account types are represented by the `role` field in the single `users` table, not by separate account tables.

## Requirements covered

- Three TypeORM entities with primary keys and appropriate fields.
- PostgreSQL connection configured through `.env` and TypeORM (`synchronize: false`).
- Three explicit TypeORM migrations in `src/database/migrations/`.
- Create DTOs with `class-validator`; required fields use `@IsNotEmpty()`.
- POST and GET endpoints for all three entities.
- Global `ValidationPipe` returns **400 Bad Request** for invalid DTO input.
- A Postman collection is included at `postman/E-Shop-Lab.postman_collection.json`.

## 1. Configure PostgreSQL

Create a PostgreSQL database named `eshop_db` (or choose another name and update `.env`). Copy `.env.example` to `.env`, then set your local PostgreSQL credentials:

```env
DB_CLIENT=postgres
DB_DATABASE=eshop_db
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
PORT=3000
```

Do not commit real passwords. The example values are for local development only.

## 2. Install and run migrations

Use Node.js and pnpm (the project includes `pnpm-lock.yaml`):

```bash
pnpm install
pnpm run migration:run
pnpm run start:dev
```

`npm install` and `npm run start:dev` can be used if you prefer npm. The migration command uses the three checked-in migration files; it does **not** use TypeORM `synchronize`.

The migration runner prints the names of executed migrations. In pgAdmin, open `eshop_db` → Schemas → public → Tables and verify `users`, `products`, `orders`, and TypeORM's `migrations` table. You can also run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

## 3. API endpoints

Base URL: `http://localhost:3000` (change port if needed). JSON requests should use `Content-Type: application/json`.

| Entity | Create (POST) | Retrieve all (GET) | Retrieve one (GET) |
|---|---|---|---|
| Users | `/users` | `/users` | `/users/:id` |
| Products | `/products` | `/products` | `/products/:id` |
| Orders | `/orders` | `/orders` | not implemented |

### Create user — `POST /users`

```json
{ "name": "Samira Ahmed", "email": "samira@example.com", "password": "secret123", "role": "CUSTOMER" }
```

`role` is optional; accepted values are `ADMIN`, `CUSTOMER`, and `EMPLOYEE`. Passwords are plain text in this lab-only starter implementation; do not use this as production authentication code.

### Create product — `POST /products`

```json
{ "name": "Wireless Mouse", "category": "Accessories", "price": 1250.00, "quantity": 20 }
```

### Create order — `POST /orders`

```json
{ "customerName": "Samira Ahmed", "customerEmail": "samira@example.com", "productName": "Wireless Mouse", "quantity": 2, "totalAmount": 2500.00, "status": "PENDING" }
```

Accepted order statuses: `PENDING`, `PAID`, `SHIPPED`, `CANCELLED`.

### Test validation (expected 400 Bad Request)

Send this to `POST /users` with JSON content type:

```json
{ "name": "", "email": "not-an-email", "password": "123" }
```

Also try `POST /products` with `{ "name": "", "category": "Accessories", "price": 100, "quantity": 2 }`, and `POST /orders` with `{ "customerName": "", "customerEmail": "not-an-email", "productName": "Mouse", "quantity": 1, "totalAmount": 100 }`. Each should return 400 due to DTO validation.

## 4. Postman test instructions

1. Import `postman/E-Shop-Lab.postman_collection.json` into Postman.
2. Keep the collection variable `baseUrl` as `http://localhost:3000`, or update it to your chosen port.
3. Run the three **POST valid** requests first, then their matching **GET all** requests. Check that at least one record appears in each response.
4. Run the three **POST invalid - expect 400** requests and confirm each response status is `400 Bad Request`.
5. Save screenshots of successful POST/GET requests, invalid requests, and the tables in pgAdmin for submission.

## Project structure

```text
src/
  database/migrations/       # explicit schema migrations (users, products, orders)
  modules/users/             # user entity, DTOs, controller, service
  modules/products/          # product entity, DTOs, controller, service
  modules/orders/            # order entity, DTOs, controller, service
  config/database.config.ts  # PostgreSQL TypeORM config; synchronize disabled
  main.ts                    # global DTO validation pipe
postman/                     # ready-to-import Postman collection
```
