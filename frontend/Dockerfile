# ──────────────────────────────────────────────
# Stage 1: build stage (nothing to build for
# a static site, but good practice to keep
# the pattern consistent)
# ──────────────────────────────────────────────
FROM nginx:1.25-alpine

# Remove default nginx config
RUN rm -rf /etc/nginx/conf.d/* /etc/nginx/nginx.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static files
COPY index.html /usr/share/nginx/html/index.html

# Expose port
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/index.html || exit 1

CMD ["nginx", "-g", "daemon off;"]
