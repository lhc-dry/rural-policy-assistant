import {startVitest} from 'vitest/node';
const context=await startVitest('test',[],{run:true,config:false,include:['src/**/*.test.ts'],environment:'node'});
if(!context)process.exitCode=1;
else {if(context.state.getFiles().some(file=>file.result?.state==='fail'))process.exitCode=1;await context.close()}
