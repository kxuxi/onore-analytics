CREATE TABLE "CityScoutReport" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "cityName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CityScoutReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CityScoutReport_userId_cityName_key" ON "CityScoutReport"("userId", "cityName");

ALTER TABLE "CityScoutReport" ADD CONSTRAINT "CityScoutReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
