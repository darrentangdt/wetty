FROM node:0.10
RUN apt-get update
RUN apt-get install -y --no-install-recommends git-core
RUN curl -sSL -O https://get.docker.com/builds/Linux/x86_64/docker-1.5.0 && chmod +x docker-1.5.0 && mv docker-1.5.0 /usr/local/bin/docker
RUN npm i chjj/pty.js --save
ADD . /app
WORKDIR /app
RUN npm install

EXPOSE 3000

ENTRYPOINT ["node"]
CMD ["app.js", "-p", "3000"]
