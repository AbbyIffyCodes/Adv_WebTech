import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestExpressApplication } from "@nestjs/platform-express";
import { ValidationPipe } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { appConfig } from "./config/app.config";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.enableCors({
    origin: appConfig.env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  });
  // Private research files must never be served as public static assets.
  const config = new DocumentBuilder()
    .setTitle("ResearchFlow API")
    .setDescription(
      "ResearchFlow backend: accounts, profiles, groups, projects, opportunities, mutual selection and named consent",
    )
    .setVersion("0.9.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api", app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: { persistAuthorization: false },
  });
  app.enableShutdownHooks();
  await app.listen(appConfig.env.PORT, appConfig.env.HOST);
}
bootstrap();
