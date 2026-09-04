import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
  @Get()
  root(): string {
    return 'Hello World!';
  }
}
