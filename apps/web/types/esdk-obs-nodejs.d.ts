declare module "esdk-obs-nodejs" {
  import type { Readable } from "node:stream";
  type Result = {
    CommonMsg: { Status: number; Code?: string; RequestId?: string };
    InterfaceResult?: { ContentLength?: number | string; ContentType?: string; Content?: Readable };
  };
  type ObjectRequest = { Bucket: string; Key: string };
  class ObsClient {
    constructor(options: {
      access_key_id: string; secret_access_key: string; security_token?: string;
      server: string; ssl_verify: boolean; timeout: number; max_retry_count: number;
      is_signature_negotiation: boolean;
    });
    putObject(params: ObjectRequest & { SourceFile: string; ContentType: string; ContentLength: number; Metadata: Record<string, string> }): Promise<Result>;
    getObjectMetadata(params: ObjectRequest): Promise<Result>;
    getObject(params: ObjectRequest & { SaveAsStream: true }): Promise<Result>;
    deleteObject(params: ObjectRequest): Promise<Result>;
  }
  export = ObsClient;
}
