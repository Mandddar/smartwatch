# Multi-stage: build static web export, then serve with nginx (smaller image, fewer I/O issues)
FROM node:20-alpine AS build
WORKDIR /app

ARG EXPO_PUBLIC_API_URL=http://localhost:8080
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL

COPY package.json ./
RUN npm install

COPY . .
RUN npx expo export --platform web

# Serve with nginx - much smaller than full node_modules
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo 'server { listen 8081; root /usr/share/nginx/html; index index.html; location / { try_files $uri $uri/ /index.html; } }' > /etc/nginx/conf.d/default.conf
EXPOSE 8081
CMD ["nginx", "-g", "daemon off;"]
