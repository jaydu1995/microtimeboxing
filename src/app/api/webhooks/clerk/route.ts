import { Webhook } from "svix";
import { headers } from "next/headers";
import { type WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { users, buckets, tasks } from "@/db/schema";
import { eq } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set");
  }

  // Verify the webhook signature
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  // Handle user.created event
  if (evt.type === "user.created") {
    const { id, email_addresses } = evt.data;
    const email = email_addresses[0]?.email_address;

    if (!email) {
      return new Response("No email found", { status: 400 });
    }

    try {
      // Create the user row
      await db.insert(users).values({ id, email }).onConflictDoNothing();

      // Create the default "General" bucket
      const [defaultBucket] = await db
        .insert(buckets)
        .values({
          userId: id,
          name: "General",
          color: "#14b8a6",
          isDefault: true,
        })
        .returning();

      // Create the default "Open Session" task inside General
      await db.insert(tasks).values({
        userId: id,
        bucketId: defaultBucket.id,
        name: "Open Session",
        minSeconds: 300,  // 5 minutes
        maxSeconds: 1500, // 25 minutes
        isDefault: true,
      });

      console.log(`✓ New user seeded: ${email}`);
    } catch (err) {
      console.error("Error seeding new user:", err);
      return new Response("Database error", { status: 500 });
    }
  }

  return new Response("OK", { status: 200 });
}
