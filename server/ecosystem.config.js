module.exports = {
  apps: [
    {
      name: "madrassaplay-api",
      script: "index.js",   // or app.js (your main server file)
      env_file: ".env",
      env: {
        NODE_ENV: "production",
      }
    }
  ]
};
