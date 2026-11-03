FROM node:20-alpine AS build
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# The official nginx image renders /etc/nginx/templates/*.template with envsubst at start-up.
# Only these variables are substituted, so nginx's own $host, $uri etc. are left alone.
ENV NGINX_ENVSUBST_FILTER="^(PORT|API_UPSTREAM)$" \
    PORT=80 \
    API_UPSTREAM=api:8000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY 15-dns-resolver.sh /docker-entrypoint.d/15-dns-resolver.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/15-dns-resolver.sh \
 && chmod +x /docker-entrypoint.d/15-dns-resolver.sh && rm -f /etc/nginx/conf.d/default.conf
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 80
