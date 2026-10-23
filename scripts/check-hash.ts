import bcrypt from "bcryptjs";

async function main() {
  const hash = "$2b$12$7NMX6S3zlGPPAhUQC0ebk.k.32pGAbhKIF.Hd8bW1otwXXBJnmqsm";
  const password = "Test!2345abc";
  const match = await bcrypt.compare(password, hash);
  console.log("Password matches:", match);
  if (!match) {
    const newHash = await bcrypt.hash(password, 12);
    console.log("New correct hash:", newHash);
    console.log("");
    console.log("Run this SQL in Neon to fix the passwords:");
    console.log(`UPDATE "User" SET "passwordHash" = '${newHash}';`);
  }
}

main();
