import path from 'path';

export default {
  entry: './src/index.js',  // ✅ Webpack starts here (your entry point)
  output: {
    filename: 'bundle.js',  // Output the bundled file as 'bundle.js'
    path: path.resolve(process.cwd(), 'dist'),  // Save the output in the 'dist' directory
  },
  mode: 'production',  // Set to 'production' to enable optimizations (you can use 'development' for testing locally)
  
  // Add the module rules for JS file handling
  module: {
    rules: [
      {
        test: /\.m?js$/,  // ✅ Matches both .js and .mjs files
        exclude: /node_modules/,  // Exclude node_modules from transpiling
        use: {
          loader: 'babel-loader',  // Use babel-loader to transpile modern JS
          options: {
            presets: ['@babel/preset-env'],  // Use the preset-env to transpile JS based on target environments
          },
        },
      },
    ],
  },

  resolve: {
    extensions: ['.js'],  // ✅ Allows you to import files without the extension (i.e., import './myFile' instead of './myFile.js')
  },

  // Watch mode will automatically rebuild your bundle when source files change
  watch: true,  // ✅ Enables watch mode
  
  // Optionally, enable source maps for better debugging in development
  devtool: 'source-map', // Use source maps for better debugging
};
