import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import { ApolloServer, ApolloServerOptions, BaseContext, GraphQLRequest, HTTPGraphQLRequest } from "@apollo/server";
import type { HttpResponse } from 'azure-functions-ts-essentials';
import { gql } from "graphql-tag";
import { GraphQLError } from "graphql";

interface CreateHandlerOptions {
    cors?: {
        origin?: boolean | string | string[];
        methods?: string | string[];
        allowedHeaders?: string | string[];
        exposedHeaders?: string | string[];
        credentials?: boolean;
        maxAge?: number;
    };
}

class AzureFunctionApolloServer extends ApolloServer {

    constructor(config: ApolloServerOptions<BaseContext>) {
        super(config);
    }

    public exportHandler({ cors }: CreateHandlerOptions = {}) {
        const staticCorsHeaders: HttpResponse['headers'] = {};

        if (cors) {
            if (cors.methods) {
                if (typeof cors.methods === 'string') {
                    staticCorsHeaders['Access-Control-Allow-Methods'] = cors.methods;
                } else if (Array.isArray(cors.methods)) {
                    staticCorsHeaders['Access-Control-Allow-Methods'] =
                        cors.methods.join(',');
                }
            }

            if (cors.allowedHeaders) {
                if (typeof cors.allowedHeaders === 'string') {
                    staticCorsHeaders['Access-Control-Allow-Headers'] =
                        cors.allowedHeaders;
                } else if (Array.isArray(cors.allowedHeaders)) {
                    staticCorsHeaders['Access-Control-Allow-Headers'] =
                        cors.allowedHeaders.join(',');
                }
            }

            if (cors.exposedHeaders) {
                if (typeof cors.exposedHeaders === 'string') {
                    staticCorsHeaders['Access-Control-Expose-Headers'] =
                        cors.exposedHeaders;
                } else if (Array.isArray(cors.exposedHeaders)) {
                    staticCorsHeaders['Access-Control-Expose-Headers'] =
                        cors.exposedHeaders.join(',');
                }
            }

            if (cors.credentials) {
                staticCorsHeaders['Access-Control-Allow-Credentials'] = 'true';
            }
            if (cors.maxAge) {
                staticCorsHeaders['Access-Control-Max-Age'] = cors.maxAge;
            }
        }

        return async (context: Context, req: HTTPGraphQLRequest) => {
            await this.ensureStarted();

            const corsHeaders: HttpResponse['headers'] = { ...staticCorsHeaders };
            const originHeader = req.headers['origin'];
            if (cors === undefined) {
                corsHeaders['Access-Control-Allow-Origin'] = '*';
            } else if (cors?.origin) {
                if (typeof cors.origin === 'string') {
                    corsHeaders['Access-Control-Allow-Origin'] = cors.origin;
                } else if (
                    typeof cors.origin === 'boolean' ||
                    (Array.isArray(cors.origin) &&
                        originHeader !== undefined &&
                        cors.origin.includes(originHeader))
                ) {
                    corsHeaders['Access-Control-Allow-Origin'] = originHeader;
                }
            }



            let graphqlRequest: GraphQLRequest = { ...req.body }
            if (req.method == "OPTIONS") {
                if (
                    req.headers['access-control-request-headers'] &&
                    (cors === undefined || (cors && !cors.allowedHeaders))
                ) {
                    corsHeaders['Access-Control-Allow-Headers'] =
                        req.headers['access-control-request-headers'];
                    corsHeaders['Vary'] = 'Access-Control-Request-Headers';
                }

                if (
                    req.headers['access-control-request-method'] &&
                    (cors === undefined || (cors && !cors.methods))
                ) {
                    corsHeaders['Access-Control-Allow-Methods'] =
                        req.headers['access-control-request-method'];
                }

                return {
                    body: '',
                    status: 204,
                    headers: corsHeaders,
                }
            } else if (req.method == 'GET') {
                try {
                    const getQuery = (req as any)?.query;
                    graphqlRequest = {
                        ...getQuery,
                        extensions: getQuery?.extensions ? JSON.parse(getQuery.extensions) : undefined
                    }
                } catch (e) {
                    throw new GraphQLError(e);
                }
            } else if (req.method == 'POST' && !graphqlRequest.query) {
                throw new GraphQLError('No query defined');
            } else if (req.method !== 'POST') {
                throw new Error('Apollo Server only support GET and POST methods')
            }

            const operationResponse = await this.executeOperation(graphqlRequest, req);

            return { status: 200, headers: corsHeaders, body: operationResponse };
        }
    }
}

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  type Query {
    hello: String
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
    Query: {
        hello: (root, args, context) => "Hello world!"
    }
};

const server = new AzureFunctionApolloServer({
    typeDefs,
    resolvers
});
server.start();

const httpTrigger: AzureFunction = server.exportHandler();

export default httpTrigger;