FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Cache dependencies in their own layer
COPY pom.xml .
RUN mvn -B -q dependency:go-offline
COPY src ./src
RUN mvn -B -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /build/target/order-service.jar /app/app.jar
USER app
ENV JAVA_OPTS="-XX:MaxRAMPercentage=70"
EXPOSE 8083
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
