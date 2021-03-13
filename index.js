const { ApolloServer, UserInputError, gql } = require('apollo-server')
const mongoose = require('mongoose')
const Person = require('./models/person')
const jwt = require('jsonwebtoken')
const JWT_SECRET = 'NEED_HERE_A_SECRET_KEY'

const MONGODB_URI =
	'mongodb+srv://user1:D3thoima101@cluster0.ytd9u.mongodb.net/graphql?retryWrites=true&w=majority'

console.log('connecting to', MONGODB_URI)

mongoose
	.connect(MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		useFindAndModify: false,
		useCreateIndex: true,
	})
	.then(() => {
		console.log('connect to MongoDB')
	})
	.catch(error => {
		console.log('connection error', error.message)
	})

const typeDefs = gql`
	type User {
		username: String!
		friends: [Person!]!
		id: ID!
	}

	type Token {
		value: String!
	}

	type Address {
		street: String!
		city: String!
	}

	type Person {
		name: String!
		phone: String
		address: Address!
		id: ID!
	}

	enum YesNo {
		YES
		NO
	}

	type Query {
		personCount: Int!
		allPersons(phone: YesNo): [Person!]!
		findPerson(name: String!): Person
		me: User
	}

	type Mutation {
		addPerson(
			name: String!
			phone: String
			street: String!
			city: String!
		): Person
		editNumber(name: String!, phone: String!): Person
		createUser(username: String!): User
		login(username: String!, password: String!): Token
	}
`
const resolvers = {
	Query: {
		personCount: () => Person.collection.countDocuments(),
		allPersons: (root, args) => {
			if (!args.phone) {
				return Person.find({})
			}

			return Person.find({ phone: { $exist: args.phone === 'YES' } })
		},
		findPerson: (root, args) => Person.findOne({ name: args.name }),
	},
	Person: {
		address: root => {
			return {
				street: root.street,
				city: root.city,
			}
		},
	},
	Mutation: {
		addPerson: async (root, args) => {
			const person = new Person({ ...args })

			try {
				await person.save()
			} catch (error) {
				throw new UserInputError(error.message, { invalidArgs: args })
			}

			return person
		},
		editNumber: async (root, args) => {
			const person = await Person.findOne({ name: args.name })
			person.phone = args.phone

			try {
				await person.save()
			} catch (error) {
				throw new UserInputError(error.message, { invalidArgs: args })
			}

			return person
		},
		createUser: (root, args) => {
			// create a user in DB server
			const user = new User({ username: args.username })

			return user.save().catch(error => {
				throw new UserInputError(error.message, {
					invalidArgs: args,
				})
			})
		},
		login: async (root, args) => {
			// find user by username from DB
			const user = await User.findOne({ username: args.username })

			if (!user || args.password !== 'secred') {
				throw new UserInputError('wrong credentials')
			}
			//token payload😁
			const userForToken = {
				username: user.username,
				id: user._id,
			}

			return { value: jwt.sign(userForToken, JWT_SECRET) }
		},
	},
}

const server = new ApolloServer({ typeDefs, resolvers })

server.listen().then(({ url }) => {
	console.log(`server ready at ${url}`)
})
