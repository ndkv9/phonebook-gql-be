const {
	ApolloServer,
	UserInputError,
	gql,
	AuthenticationError,
	PubSub,
} = require('apollo-server')

const mongoose = require('mongoose')
const Person = require('./models/person')
const User = require('./models/user')
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

const pubsub = new PubSub()

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
		friendOf: [User!]!
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
		addAsFriend(name: String!): User
	}

	type Subscription {
		personAdded: Person!
	}
`
const resolvers = {
	Query: {
		personCount: () => Person.collection.countDocuments(),
		allPersons: (root, args) => {
			if (!args.phone) {
				return Person.find({}).populate('friendOf')
			}

			return Person.find({ phone: { $exist: args.phone === 'YES' } }).populate(
				'friendOf'
			)
		},
		findPerson: (root, args) => Person.findOne({ name: args.name }),
		me: (root, args, context) => {
			return context.currentUser
		},
	},
	Person: {
		address: root => {
			return {
				street: root.street,
				city: root.city,
			}
		},
		friendOf: async root => {
			const friends = await User.find({
				friends: {
					$in: [root._id],
				},
			})
			return friends
		},
	},
	Mutation: {
		addPerson: async (root, args, context) => {
			const person = new Person({ ...args })
			const currentUser = context.currentUser

			if (!currentUser) {
				throw new AuthenticationError('not authenticated')
			}

			try {
				await person.save()
				currentUser.friends = currentUser.friends.concat(person)
				await currentUser.save()
			} catch (error) {
				throw new UserInputError(error.message, { invalidArgs: args })
			}

			pubsub.publish('PERSON_ADDED', { personAdded: person })

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
			//token payload????
			const userForToken = {
				username: user.username,
				id: user._id,
			}

			return { value: jwt.sign(userForToken, JWT_SECRET) }
		},
		addAsFriend: async (root, args, { currentUser }) => {
			const nonFriendAlready = person =>
				!currentUser.friends.map(f => f._id).includes(person._id)

			if (!currentUser) {
				throw new AuthenticationError('not authenticated!')
			}

			const person = await Person.findOne({ name: args.name })
			if (nonFriendAlready(person)) {
				currentUser.friends = currentUser.friends.concat(person)
			}

			await currentUser.save()

			return currentUser
		},
	},

	Subscription: {
		personAdded: {
			subscribe: () => pubsub.asyncIterator(['PERSON_ADDED']),
		},
	},
}

const server = new ApolloServer({
	typeDefs,
	resolvers,
	context: async ({ req }) => {
		const auth = req ? req.headers.authorization : null
		if (auth && auth.toLowerCase().startsWith('bearer ')) {
			const decodedToken = jwt.verify(auth.substring(7), JWT_SECRET)
			const currentUser = await User.findById(decodedToken.id).populate(
				'friends'
			)
			// the returned obj is the context obj
			return { currentUser }
		}
	},
})

server.listen().then(({ url, subscriptionsUrl }) => {
	console.log(`server ready at ${url}`)
	console.log(`Subscriptions ready at ${subscriptionsUrl}`)
})
