/// <reference types="vite/client" />

declare module "*.png" {
  const src: string
  export default src
}

declare module "*.css" {}

declare const process: {
  env: {
    VEILLER_PUBLIC_ENV_JSON?: string
  }
}
