import config from "@ovozai/config/eslint/react";

export default [...config, { ignores: [".next/**", "next-env.d.ts"] }];
