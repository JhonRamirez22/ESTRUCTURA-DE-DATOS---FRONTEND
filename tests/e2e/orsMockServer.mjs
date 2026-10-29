import { createServer } from "node:http";

const port = 4010;

const server = createServer(async (request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("ok");
    return;
  }

  if (request.method !== "POST" && request.method !== "GET") {
    response.writeHead(405);
    response.end();
    return;
  }

  const body = request.method === "POST" ? await readBody(request) : {};
  const coordinates = request.method === "GET"
    ? readPathCoordinates(request.url)
    : Array.isArray(body.locations)
      ? body.locations
      : Array.isArray(body.coordinates)
        ? body.coordinates
        : [];

  if (request.url?.includes("/matrix/") || request.url?.includes("/table/")) {
    const durations = coordinates.map((_, fromIndex) =>
      coordinates.map((__, toIndex) =>
        fromIndex === toIndex ? 0 : Math.abs(fromIndex - toIndex) * 60,
      ),
    );

    writeJson(response, {
      code: "Ok",
      durations,
      distances: coordinates.map((_, fromIndex) =>
        coordinates.map((__, toIndex) =>
          fromIndex === toIndex ? 0 : Math.abs(fromIndex - toIndex) * 1000,
        ),
      ),
    });
    return;
  }

  if (request.url?.includes("/directions/") || request.url?.includes("/route/")) {
    const geometry = buildRoadGeometry(coordinates);
    writeJson(response, {
      code: "Ok",
      waypoints: coordinates.map((location) => ({ location, distance: 2 })),
      routes: [{ geometry: { type: "LineString", coordinates: geometry }, distance: 1000, duration: 600 }],
      features: [{ geometry: { type: "LineString", coordinates: geometry }, properties: { summary: { distance: 1000, duration: 600 } } }],
    });
    return;
  }

