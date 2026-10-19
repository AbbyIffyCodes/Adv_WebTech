#MD. TAHMID ABTAHEE
#ID:23-53060-3
#Sec: E
 
# Database Setup Steps
 
1. Install and open PostgreSQL, then connect via DBeaver or pgAdmin using database credentials.
2. Create a new database for the project by executing the following SQL query:
 
   CREATE DATABASE user_management;
 
3. Locate the .env.example file in the project root, copy it, and rename the copy to .env.   
4. Update the .env file with local PostgreSQL username, password, host, port, and database name.Run the database migrations to automatically generate the required tables: 
npm run migration:run
npm install
 
# Build the project
npm run build
 
# Start the application in development mode
npm run start:dev
 
 
# Endpoint List:
Products:
POST /products – Create and save a product 
GET /products – Return all saved products  
GET /products/:id – Return the product with the given ID
PATCH /products/:id – Update the product with the given ID   
DELETE /products/:id – Delete a product   
 
Employees:
POST /employees – Create and save an employee   
GET /employees – Return all saved employees   
GET /employees/:id – Return the employee with the given ID  
PATCH /employees/:id – Update the employee with the given ID   
DELETE /employees/:id – Delete an employee  




# Krown Dex Backend – Setup & Run Guide
Please setup the pnpm and the node_module , use the boiler plate
````bash

This guide will help you set up and run the NestJS backend project locally.

## 🚀 Prerequisites
Before starting, ensure the following are installed:
- Node.js v22 or later
- PostgreSQL
- Redis
- npm, yarn, or pnpm (any package manager)
- Docker (optional, for containerized setup)

---

## 📦 Install Dependencies
Use any of the following commands:

```bash
pnpm install
# or
yarn install
# or
npm install


````

# 🔧 Environment Variables

Go to the project root directory
Find the file .env.example
Create a .env file in the same directory
Copy all content from .env.example into .env
Update values based on your local environment
Example:

```bash
cp .env.example .env
```

# 🗄️ Database Setup & Migrations

Create the database

```bash
create db krown_dex_db

```

Run migrations

```bash
pnpm run migration:run
# or
yarn migration:run
# or
npm run migration:run

```

# ⚡ Redis Setup

Option 1: Run Redis with Docker

```bash
docker run -d --name krown-redis -p 6379:6379 redis:7-alpine
```

Option 2: Native install- Start Redis manually, then ensure .env values match:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

```

# ▶️ Running the Backend (Development)

Start the NestJS app:

```bash
pnpm start:dev
# or
yarn start:dev
# or
npm run start:dev

```

# 🏗️ Production Build

Create a production build:

```bash
pnpm build
# or
yarn build
# or
npm run build

```

Start the production server:

```bash
pnpm start:prod
# or
yarn start:prod
# or
npm run start:prod

```

# 📁 Project Structure (Overview)

```bash
/project-root
  ├─ src/
  │   ├─ modules/
  │   ├─ common/
  │   ├─ config/
  │   ├─ main.ts
  │   └─ app.module.ts
  ├─ migrations/
  ├─ test/
  ├─ .env.example
  ├─ package.json
  └─ tsconfig.json

```
