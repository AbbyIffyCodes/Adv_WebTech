import "dotenv/config";
import { DataSource } from "typeorm";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { hashPassword } from "../common/helpers/password.helper";
import { dataSourceOptions } from "../config/database.config";
import { AccountDto } from "../modules/accounts/dto/account.dto";
import { User } from "../modules/accounts/entities/user.entity";
import { Profile } from "../modules/profiles/entities/profile.entity";
import { UserRole } from "../modules/accounts/enums/user_role.enum";

async function bootstrapCoordinator() {
  const dto = plainToInstance(AccountDto, {
    fullName: process.env.COORDINATOR_NAME,
    email: process.env.COORDINATOR_EMAIL,
    password: process.env.COORDINATOR_PASSWORD,
  });
  if ((await validate(dto)).length) {
    throw new Error(
      "Set valid COORDINATOR_NAME, COORDINATOR_EMAIL and a strong COORDINATOR_PASSWORD in your local .env",
    );
  }
  const passwordHash = await hashPassword(dto.password);
  const source = new DataSource(dataSourceOptions);
  try {
    await source.initialize();
    await source.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "researchflow:first-coordinator",
      ]);
      const users = manager.getRepository(User);
      if (await users.countBy({ role: UserRole.COORDINATOR })) {
        throw new Error(
          "A coordinator already exists. Use its account to manage roles.",
        );
      }
      if (
        await users
          .createQueryBuilder("user")
          .where("LOWER(user.email) = :email", { email: dto.email })
          .getOne()
      ) {
        throw new Error(
          "This email already has an account. Choose an unused coordinator email.",
        );
      }
      const user = await users.save(
        users.create({
          fullName: dto.fullName,
          email: dto.email,
          passwordHash,
          role: UserRole.COORDINATOR,
        }),
      );
      const profiles = manager.getRepository(Profile);
      await profiles.save(profiles.create({ userId: user.id }));
    });
    console.log(
      "First coordinator created. Clear COORDINATOR_PASSWORD from .env and log in through POST /auth/login.",
    );
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
bootstrapCoordinator().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Coordinator setup failed",
  );
  process.exitCode = 1;
});
