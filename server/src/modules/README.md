# Backend module convention

Every business module follows this structure:

```text
modules/<module>/
|-- controllers/        # tsoa HTTP transport only
|-- dal/                # Prisma queries and database projections only
|-- dto/                # Request, response, and module data contracts
`-- <module>.service.ts # Business rules and orchestration
```

- Controllers translate HTTP input/output and delegate to services.
- Services contain business rules and remain independent of Express.
- Orchestration services compose multiple business services without accessing Prisma directly.
- DAL classes are the only module files that access Prisma.
- All module request, response, service, DAL, and database-record contracts belong in the module DTO folder.
- Controller, service, and DAL files do not declare module interfaces; DAL files keep only Prisma selects and query implementations.
- API response DTOs never expose database-only fields such as password hashes.
- Shared constants and stateless helpers belong in `constants` and `utils`.
- Queries should select only required fields and avoid existence checks before writes when a database constraint can enforce the rule atomically.
