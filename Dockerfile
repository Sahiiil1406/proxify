FROM node:alpine

WORKDIR /app

COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all your app source code
COPY . .

# Expose the port your app listens on (e.g., 80)
EXPOSE 80

# Run your app
CMD ["node", "index.js"]
