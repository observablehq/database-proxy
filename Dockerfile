FROM node:16.17.0-alpine

RUN mkdir /app
WORKDIR /app

RUN apk --no-cache add bash git

COPY package.json yarn.lock /app/
RUN \
  yarn --frozen-lockfile && \
  yarn cache clean

ENV PATH="/app/node_modules/.bin:${PATH}"

COPY . /app/

CMD yarn test
