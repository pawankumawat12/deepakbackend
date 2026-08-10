const db = require("./config/db");
async function testConnection() {
    try{
        const result = await db.raw("SELECT NOW()");
        console.log('Database connected successfully');
        console.log(result.rows);

    }catch(error){
        console.error("Database connection failed:");
        console.error(error.message);
      } finally {
        await db.destroy();
    }
}

testConnection();