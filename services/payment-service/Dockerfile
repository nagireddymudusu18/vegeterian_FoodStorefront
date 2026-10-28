# syntax=docker/dockerfile:1

# ---- build stage -------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependency layer: only re-resolved when pom.xml changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

# ---- runtime stage -----------------------------------------------------
FROM eclipse-temurin:21-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /build/target/payment-service.jar /app/app.jar

ENV JAVA_OPTS="-XX:MaxRAMPercentage=70" \
    SERVER_PORT=8084
USER app
EXPOSE 8084
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
