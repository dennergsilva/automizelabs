# Imagem leve: nginx alpine servindo arquivos estáticos
FROM nginx:1.27-alpine

# Limpa default e copia apenas os arquivos da landing
RUN rm -rf /usr/share/nginx/html/*
COPY index.html /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY motion3d.js /usr/share/nginx/html/
COPY robots.txt /usr/share/nginx/html/
COPY sitemap.xml /usr/share/nginx/html/
COPY favicon.svg /usr/share/nginx/html/
COPY og-image.png /usr/share/nginx/html/
COPY privacidade/ /usr/share/nginx/html/privacidade/
COPY _sites/ /usr/share/nginx/html/_sites/

# Config nginx customizada (gzip, cache, security headers)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
